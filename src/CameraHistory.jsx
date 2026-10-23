
import { useEffect, useState } from "react";
import {
  getStorage,
  ref,
  listAll,
  getMetadata,
  getDownloadURL
} from "firebase/storage";

const SITE_ID = "butong_bridge_01";

const RETENTION_DAYS = {
  photos: 5,
  videos: 2
};

export default function CameraHistory() {
  const [media, setMedia] = useState([]);
  const [activeTab, setActiveTab] = useState("photos");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError("");
      try {
        const storage = getStorage();

        const results = await Promise.all(
          ["photos", "videos"].map(async (folder) => {
            const folderRef = ref(storage, `${SITE_ID}/${folder}`);
            const listing = await listAll(folderRef);

            const files = await Promise.all(
              listing.items.map(async (fileRef) => {
                const metadata = await getMetadata(fileRef);

                const uploadedAt = new Date(metadata.timeCreated);
                const age = Date.now() - uploadedAt.getTime();
                const maxAge = RETENTION_DAYS[folder] * 86400000;

                if (
                  !Number.isFinite(age) ||
                  age < 0 ||
                  age > maxAge
                ) {
                  return null;
                }

                const url = await getDownloadURL(fileRef);

                return {
                  path: fileRef.fullPath,
                  name: fileRef.name,
                  type: folder,
                  uploadedAt,
                  url
                };
              })
            );

            return files.filter(Boolean);
          })
        );

        if (!cancelled) {
          setMedia(
            results.flat().sort(
              (a, b) => b.uploadedAt - a.uploadedAt
            )
          );
        }
      } catch (err) {
        console.error("Camera history:", err);

        if (!cancelled) {
          setError("Unable to load camera history.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  // Allow the Escape key to close the viewer.
  
useEffect(() => {
    if (!selectedMedia) return;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSelectedMedia(null);
        return;
      }

      if (visibleMedia.length <= 1) return;

      const index = visibleMedia.findIndex(
        (item) => item.path === selectedMedia.path
      );

      if (index === -1) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();

        setSelectedMedia(
          visibleMedia[(index + 1) % visibleMedia.length]
        );
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();

        setSelectedMedia(
          visibleMedia[
            (index - 1 + visibleMedia.length) %
            visibleMedia.length
          ]
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedMedia, media, activeTab]);


  
  
const formatMediaDate = (date) =>
  date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

// Dates available in the selected Photos/Videos tab
const availableDates = [
  ...new Set(
    media
      .filter((item) => item.type === activeTab)
      .map((item) => formatMediaDate(item.uploadedAt))
  )
];

function refreshRecordings() {
  setSelectedMedia(null);
  setSelectedDate("all");
  setRefreshKey((previous) => previous + 1);
}

// Filter by media type and chosen date
const visibleMedia = media.filter((item) => {
  const matchesType = item.type === activeTab;

  const matchesDate =
    selectedDate === "all" ||
    formatMediaDate(item.uploadedAt) === selectedDate;

  return matchesType && matchesDate;
});


  // Group photos and videos by upload date
  const groupedMedia = visibleMedia.reduce((groups, item) => {
    const dateLabel = item.uploadedAt.toLocaleDateString(
      "en-PH",
      {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "long",
        day: "numeric"
      }
    );

    if (!groups[dateLabel]) {
      groups[dateLabel] = [];
    }

    groups[dateLabel].push(item);

    return groups;
  }, {});


  // Find the currently selected photo/video
  const selectedIndex = selectedMedia
    ? visibleMedia.findIndex(
        (item) => item.path === selectedMedia.path
      )
    : -1;

  // Navigate to another item
  function navigateMedia(direction) {
    if (visibleMedia.length <= 1 || selectedIndex === -1) {
      return;
    }

    const nextIndex =
      (selectedIndex + direction + visibleMedia.length) %
      visibleMedia.length;

    setSelectedMedia(visibleMedia[nextIndex]);
}


  return (
    <section className="camera-history">
      
    <div className="camera-history-header">
      <div>
        <h2>Camera Monitoring History</h2>
        <p>
          Photos: last 5 days | Videos: last 2 days
        </p>
      </div>

      <button
        type="button"
        className="camera-refresh-button"
        onClick={refreshRecordings}
        disabled={loading}
      >
        {loading ? (
          "Refreshing..."
        ) : (
          <>
            <span aria-hidden="true">↻</span>
            Refresh Recordings
          </>
        )}
      </button>
    </div>


      {/* Photo and Video Tabs */}
      <div className="camera-tabs">
        <button
          className={activeTab === "photos" ? "active" : ""}
          onClick={() => {
          setActiveTab("photos");
          setSelectedDate("all");
          setSelectedMedia(null);
        }}
        >
          Photos
        </button>

        <button
          className={activeTab === "videos" ? "active" : ""}
          onClick={() => {
            setActiveTab("videos");
            setSelectedDate("all");
            setSelectedMedia(null);
          }}
        >
          Videos
        </button>
      </div>


      {/* Date Filter */}
      <div className="camera-date-filter">
        <label htmlFor="camera-date-select">
          Filter by Date:
        </label>

        <select
          id="camera-date-select"
          value={selectedDate}
          onChange={(event) => {
            setSelectedDate(event.target.value);
            setSelectedMedia(null);
          }}
        >
          <option value="all">All Dates</option>

          {availableDates.map((date) => (
            <option key={date} value={date}>
              {date}
            </option>
          ))}
        </select>
      </div>


      {loading && <p>Loading camera history...</p>}

      {error && <p className="error">{error}</p>}

      {!loading && !error && visibleMedia.length === 0 && (
        <p className="camera-empty">
          No {activeTab} available within the retention period.
        </p>
      )}


      {/* Camera Gallery Grouped by Date */}
      <div className="camera-history-groups">
        {!loading && !error &&
          Object.entries(groupedMedia).map(([date, files]) => (
            <div className="camera-date-group" key={date}>

              <div className="camera-date-heading">
                <h3>{date}</h3>

                <span>
                  {files.length}{" "}
                  {activeTab === "photos"
                    ? files.length === 1 ? "photo" : "photos"
                    : files.length === 1 ? "video" : "videos"}
                </span>
              </div>

              <div className="camera-gallery">
                {files.map((item) => (
                  <article
                    key={item.path}
                    className="camera-item"
                  >
                    <button
                      type="button"
                      className="camera-preview-button"
                      onClick={() => setSelectedMedia(item)}
                      aria-label={`View ${item.name}`}
                    >
                      {item.type === "photos" ? (
                        <img
                          src={item.url}
                          alt={item.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="camera-video-preview">
                          <video
                            src={item.url}
                            muted
                            preload="metadata"
                          />

                          <span className="camera-play-icon">
                            ▶
                          </span>
                        </div>
                      )}

                      <span className="camera-view-label">
                        {item.type === "photos"
                          ? "View Photo"
                          : "Play Video"}
                      </span>
                    </button>

                    <div className="camera-item-details">
                      <strong>{item.name}</strong>

                      <span>
                        Uploaded:{" "}
                        {item.uploadedAt.toLocaleString(
                          "en-PH",
                          { timeZone: "Asia/Manila" }
                        )}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

            </div>
          ))}
      </div>


      {/* Enlarged Photo / Video Viewer */}
      {selectedMedia && (
        <div
          className="camera-modal-backdrop"
          role="presentation"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            className="camera-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Viewing ${selectedMedia.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            
            <div className="camera-modal-content">

              {/* Previous Button */}
              {visibleMedia.length > 1 && (
                <button
                  type="button"
                  className="camera-nav-button camera-prev"
                  onClick={() => navigateMedia(-1)}
                  aria-label="Previous media"
                  title="Previous"
                >
                  &#10094;
                </button>
              )}

              {/* Photo or Video */}
              {selectedMedia.type === "photos" ? (
                <img
                  key={selectedMedia.path}
                  src={selectedMedia.url}
                  alt={selectedMedia.name}
                />
              ) : (
                <video
                  key={selectedMedia.path}
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  playsInline
                />
              )}

              {/* Next Button */}
              {visibleMedia.length > 1 && (
                <button
                  type="button"
                  className="camera-nav-button camera-next"
                  onClick={() => navigateMedia(1)}
                  aria-label="Next media"
                  title="Next"
                >
                  &#10095;
                </button>
              )}

            </div>
            <div className="camera-modal-footer">

              <span>
                Uploaded:{" "}
                {selectedMedia.uploadedAt.toLocaleString("en-PH", {
                  timeZone: "Asia/Manila"
                })}
              </span>

              <span className="camera-counter">
                {selectedIndex + 1} of {visibleMedia.length}
              </span>

              <button
                type="button"
                onClick={() => setSelectedMedia(null)}
              >
                Close
              </button>

            </div>
          </div>
        </div>
      )}
    </section>
  );
}
