
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

// Replace after configuring secure remote access.
// Example: https://your-pi.your-tailnet.ts.net/cam/index.m3u8
const STREAM_URL = "https://rpi-thesis.taila44a15.ts.net/cam/index.m3u8";

export default function LiveCamera() {
  const videoRef = useRef(null);
  const [viewing, setViewing] = useState(false);
  const [status, setStatus] = useState("Camera inactive");

  useEffect(() => {
    if (!viewing) return;

    const video = videoRef.current;
    if (!video) return;

    let hls = null;

    if (!STREAM_URL) {
      setStatus("Remote camera address not configured yet");
      return;
    }

    setStatus("Connecting to camera...");

    if (Hls.isSupported()) {
      hls = new Hls();

      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play()
          .then(() => setStatus("Live camera connected"))
          .catch(() => setStatus("Press play to view"));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setStatus("Unable to connect to live camera");
        }
      });
    } else if (
      video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      video.src = STREAM_URL;
      video.play().catch(() => {
        setStatus("Press play to view");
      });
    } else {
      setStatus("Browser does not support HLS video");
    }

    return () => {
      if (hls) hls.destroy();

      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [viewing]);

  const stopViewing = () => {
    setViewing(false);
    setStatus("Camera inactive");
  };

  return (
    <section className="live-camera-section">
      <div className="live-camera-heading">
        <h2>Butong Bridge - Live Camera</h2>
        <span className="live-camera-badge">
          {viewing ? "VIEWING" : "INACTIVE"}
        </span>
      </div>

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
            <span>Camera preview is inactive</span>
          </div>
        )}
      </div>

      <p className="live-camera-status">{status}</p>

      <div className="live-camera-buttons">
        {!viewing ? (
          <button onClick={() => setViewing(true)}>
            View Live Camera
          </button>
        ) : (
          <button onClick={stopViewing}>
            Stop Viewing
          </button>
        )}
      </div>
    </section>
  );
}
