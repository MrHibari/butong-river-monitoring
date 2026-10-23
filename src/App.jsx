
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

import { db, auth } from "./firebase";
import Login from "./Login";
import MonitoringGraphs from "./MonitoringGraphs";
import DataStatus, { getDataHealth } from "./DataStatus";
import LiveCamera from "./LiveCamera";
import CameraHistory from "./CameraHistory";
import "./App.css";

function App() {
  const [publicStatus, setPublicStatus] = useState(null);
  const [privateStatus, setPrivateStatus] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const [isLGU, setIsLGU] = useState(false);
  const [error, setError] = useState("");
  const [loginError, setLoginError] = useState("");

  // Monitor login and logout
  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      // Automatically display LGU Dashboard
      // whenever an account is signed in.
      setShowLogin(!!currentUser);

      setPrivateStatus(null);
      setIsLGU(false);
      setLoginError("");
      setAuthLoading(false);
    });
  }, []);


  // Public river status
  useEffect(() => {
    const ref = doc(db, "public_status", "butong_bridge_01");

    return onSnapshot(
      ref,
      (snapshot) => {
        setPublicStatus(
          snapshot.exists() ? snapshot.data() : null
        );
        setError(snapshot.exists() ? "" : "Public data not found.");
      },
      () => setError("Failed to load public monitoring data.")
    );
  }, []);

  // Private LGU river status
  useEffect(() => {
    if (!user) return;

    const ref = doc(db, "current_status", "butong_bridge_01");

    return onSnapshot(
      ref,
      (snapshot) => {
        if (snapshot.exists()) {
          setPrivateStatus(snapshot.data());
          setIsLGU(true);
          setLoginError("");
        } else {
          setIsLGU(false);
          setLoginError("Private monitoring data is missing.");
        }
      },
      (err) => {
        setPrivateStatus(null);
        setIsLGU(false);
        setLoginError(
          err.code === "permission-denied"
            ? "This account is not authorized for LGU access."
            : "Unable to load private monitoring data."
        );
      }
    );
  }, [user]);

  async function handleLogout() {
    try {
      await signOut(auth);
      setShowLogin(false);
      setIsLGU(false);
      setPrivateStatus(null);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  }

  

function StatusCards({ data }) {
  const level = Number(data.water_level_m);

  const validLevel =
    data.water_level_m !== null &&
    data.water_level_m !== undefined &&
    data.water_level_m !== "" &&
    Number.isFinite(level) &&
    level >= 0;

  const health = getDataHealth(data);

  let alert = "unknown";

  if (validLevel && health.status === "recent") {
    if (level >= 1.2) {
      alert = "critical";
    } else if (level >= 0.8) {
      alert = "elevated";
    } else {
      alert = "normal";
    }
  }

  const alertLabels = {
    normal: "NORMAL",
    elevated: "ELEVATED",
    critical: "CRITICAL",
    unknown: "UNKNOWN"
  };

  const alertMessages = {
    normal: "Water level within normal range",
    elevated: "Water level is elevated",
    critical: "Critical water level detected",
    unknown: "Current flood status unavailable"
  };

  const rainStatus =
    health.status !== "recent"
      ? "Unknown"
      : data.rain_detected == null
        ? "Unknown"
        : data.rain_detected
          ? "Raining"
          : "No Rain";

  return (
    <div className="cards monitoring-cards">

      <article className="card metric-card water-card">
        <div className="metric-top">
          <span className="metric-icon">≋</span>
          <span className="metric-category">WATER LEVEL</span>
        </div>

        <strong className="metric-value">
          {validLevel ? `${level.toFixed(2)} m` : "N/A"}
        </strong>

        <p className="metric-description">
          Latest recorded water measurement
        </p>
      </article>

      <article
        className={`card metric-card alert-card alert-${alert}`}
      >
        <div className="metric-top">
          <span className="metric-icon">!</span>
          <span className="metric-category">
            FLOOD ALERT
          </span>
        </div>

        <strong className="metric-value">
          {alertLabels[alert]}
        </strong>

        <p className="metric-description">
          {alertMessages[alert]}
        </p>
      </article>

      <article className="card metric-card rain-card">
        <div className="metric-top">
          <span className="metric-icon">☁</span>
          <span className="metric-category">
            RAIN DETECTION
          </span>
        </div>

        <strong className="metric-value">
          {rainStatus}
        </strong>

        <p className="metric-description">
          {rainStatus === "Raining"
            ? "Rain detected by station sensor"
            : rainStatus === "No Rain"
              ? "No rainfall detected"
              : "Current rain status unavailable"}
        </p>
      </article>

    </div>
  );
}



  return (
    <main className="dashboard">
      <header>
        <h1>Butong River Monitoring System</h1>
        <p>Cabuyao City, Laguna</p>

        
          <nav className="nav-buttons">
            {!user ? (
              <>
                <button onClick={() => setShowLogin(false)}>
                  Public Monitoring
                </button>

                <button onClick={() => setShowLogin(true)}>
                  LGU Login
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setShowLogin(true)}>
                  LGU Dashboard
                </button>

                <button onClick={handleLogout}>
                  Sign Out
                </button>
              </>
            )}
          </nav>
      </header>

      
<section className="content">
  {authLoading ? (
    <p>Checking login status...</p>
  ) : showLogin && !user ? (
    <Login onLogin={() => setShowLogin(true)} />
  ) : showLogin && user ? (
    <>
      <h2>LGU Monitoring Dashboard</h2>

      {loginError && (
        <p className="error">{loginError}</p>
      )}

      {!loginError && !isLGU && (
        <p>Verifying LGU permissions...</p>
      )}

      {isLGU && privateStatus && (
        <>
          {/* LGU Monitoring Station Overview */}
          <div className="lgu-overview">
            <div className="lgu-overview-main">
              <span className="lgu-eyebrow">
                AUTHORIZED MONITORING PORTAL
              </span>

              <h3>Butong River Monitoring Station</h3>

              <p>
                Barangay Butong, Cabuyao City, Laguna
              </p>
            </div>

            <div className="lgu-station-meta">
              <div>
                <span>STATION ID</span>
                <strong>
                  {privateStatus.site_id ?? "butong_bridge_01"}
                </strong>
              </div>

              <div>
                <span>MONITORING SITE</span>
                <strong>Butong Bridge</strong>
              </div>

              <div>
                <span>DATA SOURCE</span>
                <strong>Firebase Firestore</strong>
              </div>
            </div>
          </div>

          {/* Sensor Data Status */}
          <DataStatus data={privateStatus} />

          {/* Monitoring Cards */}
          <StatusCards data={privateStatus} />

          {/* Additional Monitoring Information */}
          <div className="card extra-info">
            <h3>Additional Monitoring Data</h3>

            <p>
              Flow Speed:{" "}
              {privateStatus.flow_speed_mps ?? "N/A"} m/s
            </p>

            <p>
              Site ID:{" "}
              {privateStatus.site_id ?? "N/A"}
            </p>
          </div>

          {/* Historical Monitoring Graphs */}
          <MonitoringGraphs />

          {/*live camera button*/}
          <LiveCamera />

          {/* Camera Monitoring History */}
          <CameraHistory />
        </>
      )}
    </>
  ) : (
    <>
      <h2>Current River Conditions</h2>

      {error && (
        <p className="error">{error}</p>
      )}

      {publicStatus ? (
        <>
          {/* Public Monitoring Data Status */}
          <DataStatus data={publicStatus} />

          {/* Public Monitoring Cards */}
          <StatusCards data={publicStatus} />

          <p className="updated">
            Last Updated:{" "}
            {publicStatus.last_updated?.toDate
              ? publicStatus.last_updated
                  .toDate()
                  .toLocaleString()
              : "N/A"}
          </p>
        </>
      ) : !error ? (
        <p>Loading public monitoring data...</p>
      ) : null}
    </>
  )}
</section>


      <footer>
        IoT-Based Flood and Garbage Monitoring System
      </footer>
    </main>
  );
}

export default App;
