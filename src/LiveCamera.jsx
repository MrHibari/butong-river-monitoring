
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

import { auth, db } from "./firebase";

import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

const STREAM_URL =
  "https://rpi-thesis.taila44a15.ts.net/cam/index.m3u8";

const CAMERA_ID = "butong_bridge_01";

const LEASE_SECONDS = 120;
const RENEW_SECONDS = 20;
const READY_TIMEOUT_SECONDS = 90;

const cameraRef = doc(
  db,
  "camera_control",
  CAMERA_ID
);

function newRequestId() {
  return crypto.randomUUID();
}

function newExpiry() {
  return Timestamp.fromMillis(
    Date.now() + LEASE_SECONDS * 1000
  );
}

// Release only the reservation that
// belongs to this browser request.
async function releaseReservation(id, uid) {
  if (!id || !uid) return;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(cameraRef);
    if (!snap.exists()) return;

    const data = snap.data();

    if (
      data.requestId !== id ||
      data.requestedBy !== uid
    ) {
      return;
    }

    tx.update(cameraRef, {
      status: "idle",
      requestId: "",
      requestedBy: "",
      updatedAt: serverTimestamp(),
    });
  });
}

export default function LiveCamera() {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const ownerRef = useRef(null);
  const openingRef = useRef(false);

  const [requestId, setRequestId] = useState(null);
  const [mode, setMode] = useState("idle");
  const [message, setMessage] = useState(
    "Camera ready to request."
  );

  const viewing = mode === "viewing";
  const waiting = mode === "requesting";

  // ======================================
  // REQUEST CAMERA PRIORITY
  // ======================================

  async function startViewing() {
    if (ownerRef.current) return;

    const user = auth.currentUser;

    if (!user) {
      setMessage(
        "Please log in to view the camera."
      );
      return;
    }

    const id = newRequestId();

    setMode("requesting");
    setMessage(
      "Requesting camera priority..."
    );

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(cameraRef);

        if (!snap.exists()) {
          throw new Error(
            "Camera control document is missing."
          );
        }

        const data = snap.data();

        const expired =
          data.expiresAt?.toMillis?.() <
          Date.now();

        if (
          data.status !== "idle" &&
          !expired
        ) {
          throw new Error(
            "Camera is reserved by another viewer."
          );
        }

        tx.update(cameraRef, {
          status: "requested",
          requestId: id,
          requestedBy: user.uid,
          expiresAt: newExpiry(),
          updatedAt: serverTimestamp(),
        });
      });

      ownerRef.current = {
        id,
        uid: user.uid,
      };

      setRequestId(id);

      setMessage(
        "Waiting for Raspberry Pi to release camera..."
      );
    } catch (error) {
      setMode("idle");
      setMessage(
        error.message || "Camera request failed."
      );
    }
  }

  // ======================================
  // WAIT FOR RASPBERRY PI ACKNOWLEDGMENT
  // ======================================

  useEffect(() => {
    if (!requestId) return;

    const unsubscribe = onSnapshot(
      cameraRef,
      async (snap) => {
        // Do not start a stream based only
        // on stale or uncommitted local data.
        if (
          snap.metadata.fromCache ||
          snap.metadata.hasPendingWrites
        ) {
          return;
        }

        if (!snap.exists()) {
          setMessage(
            "Camera control document not found."
          );
          return;
        }

        const data = snap.data();

        if (data.requestId !== requestId) {
          ownerRef.current = null;
          setRequestId(null);
          setMode("idle");
          setMessage(
            "Camera reservation ended."
          );
          return;
        }

        if (data.status === "ready") {
          if (openingRef.current) return;

          openingRef.current = true;

          try {
            // Confirm ownership and move the
            // reservation to streaming state.
            await runTransaction(
              db,
              async (tx) => {
                const current = await tx.get(
                  cameraRef
                );

                const value = current.data();

                if (
                  value?.requestId !== requestId ||
                  value?.status !== "ready"
                ) {
                  throw new Error(
                    "Camera reservation changed."
                  );
                }

                tx.update(cameraRef, {
                  status: "streaming",
                  expiresAt: newExpiry(),
                  updatedAt: serverTimestamp(),
                });
              }
            );

            if (
              ownerRef.current?.id === requestId
            ) {
              setMode("viewing");
              setMessage("LIVE");
            }
          } catch (error) {
            setMessage(
              error.message ||
              "Failed to start live session."
            );
          } finally {
            openingRef.current = false;
          }
        }
      },
      (error) => {
        setMessage(
          `Firestore error: ${error.message}`
        );
      }
    );

    return () => unsubscribe();
  }, [requestId]);

  // ======================================
  // RENEW RESERVATION
  // ======================================

  useEffect(() => {
    if (!requestId) return;

    const timer = setInterval(async () => {
      const owner = ownerRef.current;

      if (owner?.id !== requestId) return;

      try {
        await runTransaction(
          db,
          async (tx) => {
            const snap = await tx.get(
              cameraRef
            );

            const data = snap.data();

            if (
              data?.requestId !== requestId ||
              data?.requestedBy !== owner.uid ||
              ![
                "requested",
                "ready",
                "streaming",
              ].includes(data?.status)
            ) {
              return;
            }

            tx.update(cameraRef, {
              expiresAt: newExpiry(),
              updatedAt: serverTimestamp(),
            });
          }
        );
      } catch (error) {
        console.error(
          "Camera lease renewal failed:",
          error
        );
      }
    }, RENEW_SECONDS * 1000);

    return () => clearInterval(timer);
  }, [requestId]);

  // ======================================
  // CAMERA READY TIMEOUT
  // ======================================

  useEffect(() => {
    if (!requestId || mode !== "requesting") {
      return;
    }

    const timer = setTimeout(async () => {
      const owner = ownerRef.current;

      if (owner?.id !== requestId) return;

      ownerRef.current = null;
      setRequestId(null);
      setMode("idle");
      setMessage(
        "Camera preparation timed out. Please try again."
      );

      try {
        await releaseReservation(
          owner.id,
          owner.uid
        );
      } catch (error) {
        console.error(error);
      }
    }, READY_TIMEOUT_SECONDS * 1000);

    return () => clearTimeout(timer);
  }, [requestId, mode]);

  // ======================================
  // OPEN HLS STREAM ONLY WHEN READY
  // ======================================

  useEffect(() => {
    if (!viewing) return;

    const video = videoRef.current;
    if (!video) return;

    let hls = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: true,
      });

      hlsRef.current = hls;

      hls.attachMedia(video);
      hls.loadSource(STREAM_URL);

      hls.on(
        Hls.Events.MANIFEST_PARSED,
        () => {
          video.play().catch(() => {
            setMessage(
              "Press Play to start the video."
            );
          });
        }
      );

      hls.on(
        Hls.Events.ERROR,
        (_event, data) => {
          if (data.fatal) {
            setMessage(
              "Live stream error. Try stopping and reopening."
            );
          }
        }
      );
    } else if (
      video.canPlayType(
        "application/vnd.apple.mpegurl"
      )
    ) {
      video.src = STREAM_URL;

      video.play().catch(() => {
        setMessage(
          "Press Play to start the video."
        );
      });
    } else {
      setMessage(
        "Your browser does not support HLS."
      );
    }

    return () => {
      hls?.destroy();
      hlsRef.current = null;

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [viewing]);

  // ======================================
  // STOP AND RELEASE PRIORITY
  // ======================================

  async function stopViewing() {
    const owner = ownerRef.current;

    // Immediately unmount the HLS player.
    ownerRef.current = null;
    setRequestId(null);
    setMode("idle");
    setMessage("Live viewing stopped.");

    if (!owner) return;

    try {
      await releaseReservation(
        owner.id,
        owner.uid
      );
    } catch (error) {
      console.error(
        "Failed to release camera:",
        error
      );

      setMessage(
        "Viewer stopped. Reservation will expire automatically."
      );
    }
  }

  // Attempt cleanup if component unmounts.
  // A sudden browser crash is handled by
  // the lease-expiration mechanism instead.
  useEffect(() => {
    return () => {
      const owner = ownerRef.current;

      if (owner) {
        releaseReservation(
          owner.id,
          owner.uid
        ).catch(console.error);
      }
    };
  }, []);

  // ======================================
  // INTERFACE
  // ======================================

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      <h2>Butong River Live Camera</h2>

      <p>Status: {message}</p>

      {viewing && (
        <video
          ref={videoRef}
          controls
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            background: "#000",
            borderRadius: "10px",
          }}
        />
      )}

      <div style={{ marginTop: "15px" }}>
        {mode === "idle" ? (
          <button onClick={startViewing}>
            View Live Camera
          </button>
        ) : (
          <button onClick={stopViewing}>
            {waiting
              ? "Cancel Camera Request"
              : "Stop Viewing"}
          </button>
        )}
      </div>
    </div>
  );
}
