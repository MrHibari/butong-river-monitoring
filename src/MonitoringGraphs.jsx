
import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "firebase/firestore";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine
} from "recharts";

import { db } from "./firebase";

export default function MonitoringGraphs() {
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "river-readings"),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((document) => {
            const reading = document.data();
            const timestamp = reading.timestamp?.toDate?.();

            if (!timestamp) return null;

            return {
              id: document.id,
              time: timestamp.getTime(),
              label: timestamp.toLocaleString("en-PH", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              }),
              waterLevel:
                typeof reading.water_level_m === "number"
                  ? reading.water_level_m * 100
                  : null,
              isTest: reading.is_test === true
            };
          })
          .filter(Boolean)
          .reverse();

        setReadings(data);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error(err);
        setError("Unable to load monitoring history.");
        setLoading(false);
      }
    );
  }, []);

  if (loading) {
    return <p>Loading monitoring history...</p>;
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!readings.length) {
    return <p>No historical readings available yet.</p>;
  }

  return (
    <section className="monitoring-graphs">
      <h2>Historical Monitoring Data</h2>

      {readings.some((item) => item.isTest) && (
        <p className="notice">
          TEST DATA — Includes simulated measurements
        </p>
      )}

      <div className="graphs-grid">
        <div className="graph-card">
          <h3>Water Level History</h3>

          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={readings}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis
                dataKey="label"
                minTickGap={35}
              />

              <YAxis
                unit=" cm"
                width={75}
                domain={[0, 40]}
                ticks={[0, 10, 20, 30, 40]}
                allowDataOverflow={true}
              />

              <Tooltip />
              <Legend />

              <ReferenceLine
                y={15}
                stroke="#d5a126"
                strokeDasharray="5 5"
                label="Elevated"
              />

              <ReferenceLine
                y={20}
                stroke="#dc4444"
                strokeDasharray="5 5"
                label="Critical"
              />

              <Line
                type="monotone"
                dataKey="waterLevel"
                name="Water Level (cm)"
                stroke="#1769aa"
                strokeWidth={3}
                dot
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
