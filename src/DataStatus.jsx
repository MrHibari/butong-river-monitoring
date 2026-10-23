
import { useEffect, useState } from "react";

const STALE_AFTER_MINUTES = 10;

export function getDataHealth(data, now = Date.now()) {
  const timestamp = data?.last_updated?.toDate?.();

  if (
    !timestamp ||
    Number.isNaN(timestamp.getTime())
  ) {
    return {
      status: "unknown",
      label: "STATUS UNKNOWN",
      message: "No valid update timestamp available."
    };
  }

  const ageMs = now - timestamp.getTime();

  if (ageMs < -60000) {
    return {
      status: "unknown",
      label: "CLOCK ERROR",
      message: "Reading timestamp is in the future."
    };
  }

  if (ageMs > STALE_AFTER_MINUTES * 60000) {
    return {
      status: "stale",
      label: "DATA OUTDATED",
      message: "No recent monitoring data received."
    };
  }

  return {
    status: "recent",
    label: "RECENT DATA",
    message: "Latest reading is within the expected window."
  };
}

export default function DataStatus({ data }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const health = getDataHealth(data, now);
  const timestamp = data?.last_updated?.toDate?.();

  return (
    <div className={`data-status data-${health.status}`}>
      <div className="data-status-heading">
        <span className="status-dot" />
        <strong>{health.label}</strong>
      </div>

      <p>{health.message}</p>

      <p>
        Last Updated:{" "}
        {timestamp && !Number.isNaN(timestamp.getTime())
          ? timestamp.toLocaleString("en-PH")
          : "Unavailable"}
      </p>

      {data?.is_test === true && (
        <strong className="test-label">
          TEST DATA — Not live river measurements
        </strong>
      )}
    </div>
  );
}
