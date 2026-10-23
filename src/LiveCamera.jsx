
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

import { auth, db } from "./firebase";
import "./LiveCamera.css";

import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ==========================================
// CONFIGURATION
// ==========================================

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

// ==========================================
// HELPERS
// ==========================================

function newRequestId() {
  return crypto.randomUUID();
}

function newExpiry() {
  return Timestamp.fromMillis(
    Date.now() + LEASE_SECONDS * 1000
  );
}

// Release only a reservation owned by
// this specific browser request.
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

// ==========================================
// COMPONENT
// ==========================================

export default function LiveCamera() {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  const ownerRef = useRef(null);
  const openingRef = useRef(false);
  const requestInProgressRef = useRef(false);
  const cancelPendingRef = useRef(false);

  const [requestId, setRequestId] = useState(null);
  const [mode, setMode] = useState("idle");

  const [message, setMessage] = useState(
    "Camera ready to request."
  );

  const viewing = mode === "viewing";
  const waiting = mode === "requesting";

  // ========================================
  // REQUEST LIVE CAMERA PRIORITY
  // ========================================

  async function startViewing() {
    if (
      ownerRef.current ||
      requestInProgressRef.current
    ) {
      return;
    }

    const user = auth.currentUser;

    if (!user) {
      setMessage(
        "Please log in to access the live camera."
      );
      return;
    }

    requestInProgressRef.current = true;
    cancelPendingRef.current = false;

    const id = newRequestId();

    setMode("requesting");
    setMessage("Requesting camera priority...");

    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(cameraRef);

        if (!snap.exists()) {
          throw new Error(
            "Camera control document was not found."
          );
        }

        const data = snap.data();

        const expired =
          typeof data.expiresAt?.toMillis ===
            "function" &&
          data.expiresAt.toMillis() <
            Date.now();

        if (
          data.status !== "idle" &&
          !expired
        ) {
          throw new Error(
            "Camera is currently reserved by another viewer."
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

      if (cancelPendingRef.current) {
        const owner = ownerRef.current;
        ownerRef.current = null;

        await releaseReservation(
          owner.id,
          owner.uid
        );

        return;
      }

      setRequestId(id);

      setMessage(
        "Waiting for Raspberry Pi to prepare the camera..."
      );
    } catch (error) {
      setMode("idle");

      setMessage(
        error.message || "Camera request failed."
      );
    } finally {
      requestInProgressRef.current = false;
    }
  }

  // ========================================
  // LISTEN FOR RASPBERRY PI RESPONSE
  // ========================================

  useEffect(() => {
    if (!requestId) return;

    const unsubscribe = onSnapshot(
      cameraRef,
      async (snapshot) => {
        if (
          snapshot.metadata.fromCache ||
          snapshot.metadata.hasPendingWrites
        ) {
          return;
        }

        if (!snapshot.exists()) {
          setMessage(
            "Camera control document not found."
          );
          return;
        }

        const data = snapshot.data();

        // Ignore acknowledgments belonging
        // to any other reservation.
        if (data.requestId !== requestId) {
          if (
            ownerRef.current?.id === requestId
          ) {
            ownerRef.current = null;
            setRequestId(null);
            setMode("idle");
            setMessage(
              "Camera reservation ended."
            );
          }

          return;
        }

        // Pi has finished the capture and
        // confirmed that the camera is ready.
        if (data.status === "ready") {
          if (
            openingRef.current ||
            ownerRef.current?.id !== requestId
          ) {
            return;
          }

          openingRef.current = true;

          try {
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
              setMessage("LIVE - Camera connected");
            }
          } catch (error) {
            setMessage(
              error.message ||
                "Unable to start live viewing."
            );
          } finally {
            openingRef.current = false;
          }
        }
      },
      (error) => {
        setMessage(
          "Firestore error: " + error.message
        );
      }
    );

    return () => unsubscribe();
  }, [requestId]);

  // ========================================
  // AUTOMATIC LEASE RENEWAL
  // ========================================

  useEffect(() => {
    if (!requestId) return;

    const renew = async () => {
      const owner = ownerRef.current;

      if (owner?.id !== requestId) {
        return;
      }

      try {
        await runTransaction(
          db,
          async (tx) => {
            const snap = await tx.get(
              cameraRef
            );

            if (!snap.exists()) return;

            const data = snap.data();

            if (
              data.requestId !== requestId ||
              data.requestedBy !== owner.uid ||
              ![
                "requested",
                "ready",
                "streaming",
              ].includes(data.status)
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
    };

    const timer = setInterval(
      renew,
      RENEW_SECONDS * 1000
    );

    return () => clearInterval(timer);
  }, [requestId]);

  // ========================================
  // WAITING TIMEOUT
  // ========================================

  useEffect(() => {
    if (
      !requestId ||
      mode !== "requesting"
    ) {
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
        console.error(
          "Reservation timeout cleanup failed:",
          error
        );
      }
    }, READY_TIMEOUT_SECONDS * 1000);

    return () => clearTimeout(timer);
  }, [requestId, mode]);

  // ========================================
  // START HLS LIVE STREAM
  // ========================================

  useEffect(() => {
    if (!viewing) return;

    const video = videoRef.current;

    if (!video) return;

    let hls = null;

    setMessage("Connecting to live camera...");

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
          video
            .play()
            .then(() => {
              setMessage(
                "LIVE - Camera connected"
              );
            })
            .catch(() => {
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
              "Live stream unavailable. Stop viewing and try again."
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

      video
        .play()
        .then(() => {
          setMessage(
            "LIVE - Camera connected"
          );
        })
        .catch(() => {
          setMessage(
            "Press Play to start the video."
          );
        });
    } else {
      setMessage(
        "Your browser does not support HLS video."
      );
    }

    // Release the video player when viewing ends.
    return () => {
      if (hls) {
        hls.destroy();
      }

      hlsRef.current = null;

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [viewing]);

  // ========================================
  // STOP VIEWING AND RELEASE CAMERA
  // ========================================

  async function stopViewing() {
    cancelPendingRef.current = true;

    const owner = ownerRef.current;

    ownerRef.current = null;

    // Immediately stop the video player.
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
        "Camera release failed:",
        error
      );

      setMessage(
        "Viewing stopped. Reservation will expire automatically."
      );
    }
  }

  // ========================================
  // CLEANUP ON COMPONENT UNMOUNT
  // ========================================

  useEffect(() => {
    return () => {
      cancelPendingRef.current = true;

      const owner = ownerRef.current;

      ownerRef.current = null;

      if (owner) {
        releaseReservation(
          owner.id,
          owner.uid
        ).catch(console.error);
      }
    };
  }, []);

  // ========================================
  // NEW LIVE CAMERA INTERFACE
  // ========================================

  return (
    <section className="live-camera-card">

      {/* HEADER */}

      <div className="live-camera-header">
        <div className="live-camera-title">

          <span className="live-camera-icon">
            📹
          </span>

          <div>
            <h2>Butong River Live Camera</h2>

            <p>
              BRIDGE MONITORING • CAM 01
            </p>
          </div>
        </div>

        <span
          className={
            "live-camera-badge " +
            (viewing
              ? "live"
              : waiting
              ? "waiting"
              : "")
          }
        >
          {viewing
            ? "● LIVE"
            : waiting
            ? "◷ PREPARING"
            : "● STANDBY"}
        </span>
      </div>

      {/* VIDEO PREVIEW */}

      <div className="live-camera-body">

        <div className="live-camera-screen">

          {viewing ? (
            <video
              ref={videoRef}
              controls
              autoPlay
              muted
              playsInline
            />
          ) : (
            <div className="live-camera-placeholder">

              <span className="live-camera-placeholder-icon">
                {waiting ? "⏳" : "📷"}
              </span>

              <h3>
                {waiting
                  ? "Preparing Live Camera"
                  : "Camera Preview Offline"}
              </h3>

              <p>
                {waiting
                  ? "Waiting for Raspberry Pi to release the camera..."
                  : "Click View Live Camera to monitor the river."}
              </p>

            </div>
          )}

        </div>

        {/* STATUS AND CONTROLS */}

        <div className="live-camera-footer">

          <p
            className="live-camera-status"
            role="status"
            aria-live="polite"
          >
            {message}
          </p>

          {mode === "idle" ? (
            <button
              type="button"
              className="live-camera-button"
              onClick={startViewing}
            >
              ▶ View Live Camera
            </button>
          ) : (
            <button
              type="button"
              className="live-camera-button stop"
              onClick={stopViewing}
            >
              {waiting
                ? "Cancel Camera Request"
                : "■ Stop Viewing"}
            </button>
          )}

          <p className="live-camera-note">
            Secure Live Monitoring •
            Butong Bridge, Cabuyao
          </p>

        </div>
      </div>
    </section>
  );
}
