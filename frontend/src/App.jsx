  // src/App.jsx
  import { useEffect, useMemo, useState } from "react";
  import { createClient } from "@supabase/supabase-js";

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  export default function App() {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("analytics");
    const [allData, setAllData] = useState([]);
    // Extended filters: keep original ones and add title & insight as dropdown filters
    const [filters, setFilters] = useState({
      end_year: "",
      topic: "",
      sector: "",
      region: "",
      pestle: "",
      source: "",
      country: "",
      title: "",
      insight: ""
    });

    // search text + which field to perform a text search over (all/title/insight/topic/...)
    const [searchText, setSearchText] = useState("");
    const [searchField, setSearchField] = useState("all");

    // Options for dropdowns (derived from loaded data)
    const [options, setOptions] = useState({
      end_year: [],
      topic: [],
      sector: [],
      region: [],
      pestle: [],
      source: [],
      country: [],
      title: [],
      insight: []
    });

    // On mount: allow page to scroll correctly and keep layout-friendly defaults.
    useEffect(() => {
      // ensure the page is scrollable (full-page scrolling)
      // we only set minimal styles so we don't override user's full CSS
      document.documentElement.style.height = "100%";
      document.body.style.minHeight = "100%";
      document.body.style.overflowY = "auto";

      // cleanup on unmount
      return () => {
        document.documentElement.style.height = "";
        document.body.style.minHeight = "";
        document.body.style.overflowY = "";
      };
    }, []);
useEffect(() => {
  async function fetchInsightData() {
    setLoading(true);

    // 1. Helper: Process fetched rows and update UI dropdowns
    const processRows = (rows) => {
      const sourceData = allData.length ? allData : rows;
      
      const makeSet = (k) => {
        const values = sourceData
          .map((r) => r[k])
          .filter((v) => v !== null && v !== undefined && v !== "")
          .map((v) => String(v).trim());

        const unique = [...new Set(values)];

        if (k === "end_year") {
          return unique
            .map(Number)
            .filter((n) => !isNaN(n))
            .sort((a, b) => a - b)
            .map(String);
        }
        return unique.sort();
      };

      if (!allData.length) setAllData(rows);
      setData(rows);
      setOptions({
        end_year: makeSet("end_year"),
        topic: makeSet("topic"),
        sector: makeSet("sector"),
        region: makeSet("region"),
        pestle: makeSet("pestle"),
        source: makeSet("source"),
        country: makeSet("country"),
        title: makeSet("title"),
        insight: makeSet("insight")
      });
    };

    // 2. Helper: Fail-safe to FastAPI backend
    const fetchFromFallback = async () => {
      console.warn("Supabase unavailable. Falling back to local FastAPI...");
      try {
        const response = await fetch("http://localhost:8000/data");
        const fallbackData = await response.json();
        processRows(fallbackData || []);
      } catch (fallbackErr) {
        console.error("Critical: Fallback backend also failed.", fallbackErr);
        setData([]);
      }
    };

    // 3. Main Execution Logic
    try {
      let query = supabase.from("blackcoffer_data").select("*");

      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          query = query.eq(key, filters[key]);
        }
      });

      const { data: result, error } = await query.limit(1000);

      if (error) {
        console.error("Supabase error:", error.message);
        await fetchFromFallback();
      } else {
        processRows(result || []);
      }
    } catch (err) {
      console.error("Supabase network error:", err);
      await fetchFromFallback();
    } finally {
      setLoading(false);
    }
  }

  fetchInsightData();
}, [filters]);

    const handleFilterChange = (key) => (event) => {
      const value = event.target.value;
      setFilters((prev) => ({ ...prev, [key]: value }));
    };

    // Keep a small helper to clear filters quickly
    const clearFilters = () => {
      setFilters({
        end_year: "",
        topic: "",
        sector: "",
        region: "",
        pestle: "",
        source: "",
        country: "",
        title: "",
        insight: ""
      });
    };

    //Search Logic with Dropdown
    const visibleData = useMemo(() => {
      // Start from data (which is DB-filtered)
      if (!searchText.trim()) return data;

      const term = searchText.toLowerCase();

      return data.filter((item) => {
        const fields = {
          title: (item.title || "").toString().toLowerCase(),
          insight: (item.insight || "").toString().toLowerCase(),
          topic: (item.topic || "").toString().toLowerCase(),
          sector: (item.sector || "").toString().toLowerCase(),
          region: (item.region || "").toString().toLowerCase(),
          country: (item.country || "").toString().toLowerCase()
        };

        if (searchField === "all") {
          return Object.values(fields).some((value) => value.includes(term));
        }

        // if searchField is something unexpected, fallback to 'all'
        if (!fields.hasOwnProperty(searchField)) {
          return Object.values(fields).some((value) => value.includes(term));
        }

        return fields[searchField]?.includes(term);
      });
    }, [data, searchText, searchField]);

    // Top-level stats: averages + count (unchanged)
    const stats = useMemo(() => {
      if (!visibleData.length) {
        return { intensity: 0, likelihood: 0, relevance: 0, count: 0 };
      }
      const avg = (key) =>
        (
          visibleData.reduce((sum, row) => sum + (row[key] || 0), 0) /
          visibleData.length
        ).toFixed(1);

      return {
        intensity: avg("intensity"),
        likelihood: avg("likelihood"),
        relevance: avg("relevance"),
        count: visibleData.length
      };
    }, [visibleData]);

    // Region vs average intensity 
    const regionChart = useMemo(() => {
      const map = {};
      visibleData.forEach((row) => {
        const region = row.region || "Unknown";
        const val = row.intensity || 0;
        if (!map[region]) map[region] = { region, total: 0, count: 0 };
        map[region].total += val;
        map[region].count += 1;
      });

      const rows = Object.values(map).map((r) => ({
        region: r.region,
        avgIntensity: r.total / r.count
      }));

      rows.sort((a, b) => b.avgIntensity - a.avgIntensity);
      const top = rows.slice(0, 6);
      const maxVal = top.reduce((m, r) => (r.avgIntensity > m ? r.avgIntensity : m), 0);

      return { rows: top, max: maxVal || 1 };
    }, [visibleData]);

    // Topic vs total relevance
    const topicChart = useMemo(() => {
      const map = {};
      visibleData.forEach((row) => {
        const topic = row.topic || "Unknown";
        const val = row.relevance || 0;
        if (!map[topic]) map[topic] = { topic, total: 0 };
        map[topic].total += val;
      });

      const rows = Object.values(map);
      rows.sort((a, b) => b.total - a.total);
      const top = rows.slice(0, 6);
      const maxVal = top.reduce((m, r) => (r.total > m ? r.total : m), 0);

      return { rows: top, max: maxVal || 1 };
    }, [visibleData]);

   
    return (
      <div
        className="app-shell"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "stretch",
          overflowX: "hidden" // avoid horizontal scroll
        }}
      >
        {loading && (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      background: "rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999
    }}
  >
    <div
      style={{
        background: "#fff",
        padding: "20px 30px",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        fontWeight: 600
      }}
    >
      Sorting insights...
    </div>
  </div>
)}
        {/* SIDEBAR */}
        <aside
          className="app-sidebar"
          style={{
            width: 220,
            flex: "0 0 220px",
            borderRight: "1px solid #e6e6e6",
            padding: 16,
            boxSizing: "border-box",
            position: "sticky",
            top: 0,
            height: "100vh",
            overflowY: "auto",
            background: "var(--sidebar-bg, #fff)",
            zIndex: 10
          }}
        >
          <div className="sidebar-header" style={{ marginBottom: 16 }}>
            <div
              className="sidebar-logo"
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "#6b46c1",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "700",
                marginBottom: 8
              }}
            >
              V
            </div>
            <span className="sidebar-title" style={{ fontWeight: 700 }}>
              Dashboard
            </span>
          </div>

          <nav className="sidebar-nav">
            <div
  className={`sidebar-item ${activeTab === "analytics" ? "sidebar-item--active" : ""}`}
  style={{ display: "flex", gap: 8, padding: "8px 6px", cursor: "pointer" }}
  onClick={() => setActiveTab("analytics")}
>
  <span className="sidebar-icon">🏠</span>
  <span>Analytics</span>
</div>

<div
  className={`sidebar-item ${activeTab === "trends" ? "sidebar-item--active" : ""}`}
  style={{ display: "flex", gap: 8, padding: "8px 6px", cursor: "pointer" }}
  onClick={() => setActiveTab("trends")}
>
  <span className="sidebar-icon">📈</span>
  <span>Trends</span>
</div>

<div
  className={`sidebar-item ${activeTab === "insights" ? "sidebar-item--active" : ""}`}
  style={{ display: "flex", gap: 8, padding: "8px 6px", cursor: "pointer" }}
  onClick={() => setActiveTab("insights")}
>
  <span className="sidebar-icon">📊</span>
  <span>Insights</span>
</div>
          </nav>

          {/* Quick small legend or notes could go here without removing features */}
        </aside>

        {/* MAIN AREA */}
        <div
          className="app-main"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
            overflow: "visible"
          }}
        >
          {/* NAVBAR */}
          <header
            className="app-navbar"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 20px",
              borderBottom: "1px solid #eee",
              background: "var(--navbar-bg, #fff)",
              position: "sticky",
              top: 0,
              zIndex: 5
            }}
          >
            <div className="navbar-left">
              <span className="navbar-title" style={{ fontWeight: 700 }}>
                Climate Insights Dashboard
              </span>
            </div>

            <div className="navbar-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Search field selector */}
              <select
                className="navbar-select"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: "#fff"
                }}
                title="Choose field to search"
              >
                <option value="all">All</option>
                <option value="title">Title</option>
                <option value="insight">Insight</option>
                <option value="topic">Topic</option>
                <option value="sector">Sector</option>
                <option value="region">Region</option>
                <option value="country">Country</option>
              </select>

              <input
                className="navbar-search"
                type="text"
                placeholder="Search by selected field (or All)..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  minWidth: 260
                }}
              />

              <div className="navbar-avatar" style={{ width: 40, height: 40 }}>
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Dheeraj"
                  alt="avatar"
                  style={{ width: "100%", height: "100%", borderRadius: 8 }}
                />
              </div>
            </div>
          </header>

          {/* CONTENT */}
          <main
            className="app-content"
            style={{
              padding: 20,
              overflow: "visible"
            }}
          >
            {/* FILTERS section: swapped inputs for dropdowns populated from options (preserving original labels & layout) */}
            <section className="card filter-card" style={{ marginBottom: 20 }}>
              <div className="card-header" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Data Filter Control</h2>
                <span className="card-subtitle" style={{ color: "#666" }}>
                  Filter by end year, topic, sector, region, PESTLE, source, country, title, insight.
                </span>
              </div>

              <div className="filter-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                {/* End year */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>End year</label>
                  <select value={filters.end_year} onChange={handleFilterChange("end_year")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All end years</option>
                    {options.end_year.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Topic */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Topic</label>
                  <select value={filters.topic} onChange={handleFilterChange("topic")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All topics</option>
                    {options.topic.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sector */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Sector</label>
                  <select value={filters.sector} onChange={handleFilterChange("sector")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All sectors</option>
                    {options.sector.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Region */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Region</label>
                  <select value={filters.region} onChange={handleFilterChange("region")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All regions</option>
                    {options.region.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* PESTLE */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>PESTLE</label>
                  <select value={filters.pestle} onChange={handleFilterChange("pestle")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All PESTLE</option>
                    {options.pestle.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Source</label>
                  <select value={filters.source} onChange={handleFilterChange("source")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All sources</option>
                    {options.source.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Country */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Country</label>
                  <select value={filters.country} onChange={handleFilterChange("country")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All countries</option>
                    {options.country.map((val) => (
                      <option key={val} value={val}>
                        {val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title (added as dropdown filter, preserves all features and allows explicit title filtering) */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Title</label>
                  <select value={filters.title} onChange={handleFilterChange("title")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All titles</option>
                    {options.title.map((val, idx) => (
                      <option key={val + idx} value={val}>
                        {val.length > 80 ? val.slice(0, 80) + "…" : val}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Insight (added as dropdown filter; long text truncated in options) */}
                <div className="filter-field">
                  <label style={{ display: "block", marginBottom: 6 }}>Insight</label>
                  <select value={filters.insight} onChange={handleFilterChange("insight")} style={{ width: "100%", padding: 8, borderRadius: 6 }}>
                    <option value="">All insights</option>
                    {options.insight.map((val, idx) => (
                      <option key={val + idx} value={val}>
                        {val.length > 80 ? val.slice(0, 80) + "…" : val}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  onClick={clearFilters}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Clear filters
                </button>

                <div style={{ alignSelf: "center", color: "#666" }}>
                  Showing all 1000 DB rows — use dropdowns above to refine.
                </div>
              </div>
            </section>

            {/* METRIC CARDS */}
            <section className="metrics-row" style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div className="metric-card metric-card--purple" style={{ flex: 1, padding: 12, borderRadius: 8, background: "#f3e8ff" }}>
                <span className="metric-label">Avg Intensity</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.intensity}</div>
              </div>
              <div className="metric-card metric-card--red" style={{ flex: 1, padding: 12, borderRadius: 8, background: "#fff5f5" }}>
                <span className="metric-label">Avg Likelihood</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.likelihood}</div>
              </div>
              <div className="metric-card metric-card--green" style={{ flex: 1, padding: 12, borderRadius: 8, background: "#f0fff4" }}>
                <span className="metric-label">Avg Relevance</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.relevance}</div>
              </div>
              <div className="metric-card metric-card--orange" style={{ flex: 1, padding: 12, borderRadius: 8, background: "#fffaf0" }}>
                <span className="metric-label">Insights Count</span>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.count}</div>
              </div>
            </section>

            {/* CHARTS */}
{(activeTab === "analytics" || activeTab === "trends") && (
  <section className="charts-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
    {/* Intensity by Region */}
    <div className="card chart-card" style={{ padding: 12, borderRadius: 8 }}>
      <div className="card-header" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Intensity by Region</h2>
        <span className="card-subtitle" style={{ color: "#666" }}>
          Average intensity for top regions in current filter.
        </span>
      </div>
      <div className="chart-body">
        {regionChart.rows.length === 0 ? (
          <p className="chart-empty">No data for this selection.</p>
        ) : (
          regionChart.rows.map((row) => (
            <div className="chart-row" key={row.region} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="chart-label" style={{ width: 110 }}>{row.region}</span>
              <div className="chart-bar-track" style={{ flex: 1, height: 12, background: "#f1f1f1", borderRadius: 6 }}>
                <div
                  className="chart-bar-fill chart-bar-fill--purple"
                  style={{
                    height: "100%",
                    borderRadius: 6,
                    width: `${(row.avgIntensity / regionChart.max) * 100}%`,
                    background: "#7c3aed"
                  }}
                />
              </div>
              <span className="chart-value-small" style={{ width: 48, textAlign: "right" }}>
                {row.avgIntensity.toFixed(1)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>

    {/* Topic relevance */}
    <div className="card chart-card" style={{ padding: 12, borderRadius: 8 }}>
      <div className="card-header" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Topic Relevance</h2>
        <span className="card-subtitle" style={{ color: "#666" }}>
          Total relevance scores for leading topics.
        </span>
      </div>
      <div className="chart-body">
        {topicChart.rows.length === 0 ? (
          <p className="chart-empty">No data for this selection.</p>
        ) : (
          topicChart.rows.map((row) => (
            <div className="chart-row" key={row.topic} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span className="chart-label" style={{ width: 110 }}>{row.topic}</span>
              <div className="chart-bar-track" style={{ flex: 1, height: 12, background: "#f1f1f1", borderRadius: 6 }}>
                <div
                  className="chart-bar-fill chart-bar-fill--blue"
                  style={{
                    height: "100%",
                    borderRadius: 6,
                    width: `${(row.total / topicChart.max) * 100}%`,
                    background: "#2563eb"
                  }}
                />
              </div>
              <span className="chart-value-small" style={{ width: 48, textAlign: "right" }}>
                {row.total.toFixed(1)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  </section>
)}

           {/* TABLE - now shows ALL visibleData rows inside a scrollable container while still allowing full page scroll */}
{(activeTab === "analytics" || activeTab === "insights") && (
  <section className="card table-card" style={{ borderRadius: 8, padding: 12 }}>
    <div className="card-header" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>Detailed Insights Feed</h2>
      <span className="card-subtitle" style={{ color: "#666" }}>
        Showing all rows from the filtered dataset in a scrollable table area.
      </span>
    </div>

    <div
      className="table-wrapper"
      style={{
        maxHeight: "600px",
        overflowY: "auto",
        overflowX: "auto",
        border: "1px solid #eee",
        borderRadius: 8,
        padding: 8,
        background: "#fff"
      }}
    >
      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 3 }}>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>Insight title</th>
            <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>Topic / Sector</th>
            <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>Location</th>
            <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>End year</th>
            <th className="text-right" style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>Intensity</th>
            <th className="text-right" style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>Likelihood</th>
            <th className="text-right" style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid #f0f0f0" }}>Relevance</th>
          </tr>
        </thead>
        <tbody>
          {visibleData.map((row) => (
            <tr key={row.id} style={{ borderBottom: "1px solid #fafafa" }}>
              <td className="cell-title" style={{ padding: "10px 12px", verticalAlign: "top", maxWidth: 420 }}>
                <div className="cell-main" style={{ fontWeight: 600 }}>
                  {row.title || row.insight || "Untitled insight"}
                </div>
                <div className="cell-sub" style={{ color: "#666", marginTop: 6 }}>
                  {row.source || "Unknown source"}
                </div>
              </td>
              <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                <div className="badge" style={{ display: "inline-block", padding: "4px 8px", borderRadius: 6, background: "#f3f4f6", marginBottom: 6 }}>
                  {row.sector || "General"}
                </div>
                <div className="cell-sub" style={{ color: "#666", marginTop: 6 }}>
                  {row.topic || "N/A"}
                </div>
              </td>
              <td style={{ padding: "10px 12px", verticalAlign: "top" }}>
                <div className="cell-main">{row.region || "Global"}</div>
                <div className="cell-sub" style={{ color: "#666" }}>{row.country || "World"}</div>
              </td>
              <td style={{ padding: "10px 12px", verticalAlign: "top" }}>{row.end_year || "-"}</td>
              <td className="text-right" style={{ textAlign: "right", padding: "10px 12px", verticalAlign: "top" }}>{row.intensity || 0}</td>
              <td className="text-right" style={{ textAlign: "right", padding: "10px 12px", verticalAlign: "top" }}>{row.likelihood || 0}</td>
              <td className="text-right" style={{ textAlign: "right", padding: "10px 12px", verticalAlign: "top" }}>{row.relevance || 0}</td>
            </tr>
          ))}

          {visibleData.length === 0 && (
            <tr>
              <td colSpan={7} className="table-empty" style={{ padding: 20, textAlign: "center" }}>
                No records match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
)}
          </main>
        </div>
      </div>
    );
  }