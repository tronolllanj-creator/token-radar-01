const fmtUSD = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(0);
};

const fmtPct = (n) => {
  if (n == null || isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(1) + "%";
};

const fmtAge = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (n >= 365) return (n / 365).toFixed(1) + "y";
  return Math.round(n) + "d";
};

const esc = (s) => {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const getState = () => {
  const params = new URLSearchParams(window.location.search || '');
  return {
    view: params.get("view") || "board",
    id: params.get("id") || "",
    filter: params.get("filter") || "",
    sort: params.get("sort") || "implied",
    q: params.get("q") || "",
    cat: params.get("cat") || "",
    chain: params.get("chain") || "",
    wl: params.get("wl") === "1"
  };
};

const applyFilters = (rows, state, watchlistSlugs) => {
  const wlSet = new Set(watchlistSlugs || []);
  return rows.filter((r) => {
    if (state.wl && !wlSet.has(r.slug)) return false;

    if (state.cat && r.category !== state.cat) return false;

    if (state.chain) {
      const chains = Array.isArray(r.chains) ? r.chains : [];
      if (!chains.includes(state.chain)) return false;
    }

    if (state.filter) {
      const f = state.filter.toLowerCase();
      const catMatch = r.category && r.category.toLowerCase() === f;
      const chainMatch = Array.isArray(r.chains) && r.chains.some((c) => c.toLowerCase() === f);
      if (!catMatch && !chainMatch) return false;
    }

    if (state.q) {
      const q = state.q.toLowerCase();
      const nameMatch = r.name && r.name.toLowerCase().includes(q);
      const slugMatch = r.slug && r.slug.toLowerCase().includes(q);
      if (!nameMatch && !slugMatch) return false;
    }

    return true;
  }).sort((a, b) => {
    const s = state.sort;
    const fieldMap = {
      implied: "implied_value_usd",
      tvl: "tvl_usd",
      change7d: "change_7d",
      age: "age_days"
    };
    const sortField = fieldMap[s] || "implied_value_usd";
    let va = a[sortField];
    let vb = b[sortField];

    if (sortField === "change_7d" || sortField === "age_days" || sortField === "tvl_usd" || sortField === "implied_value_usd") {
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    }

    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  });
};

const renderBoard = (rows, state, watchlistSlugs) => {
  const board = document.getElementById("board");
  if (!board) return;

  const filtered = applyFilters(rows, state, watchlistSlugs);

  let html = `
    <div class="results-count">Showing ${filtered.length} of ${rows.length} protocols</div>
    <div class="table-responsive">
      <table class="board-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Protocol</th>
            <th>Category</th>
            <th>Chains</th>
            <th>TVL</th>
            <th>7d</th>
            <th>Age</th>
            <th>Implied value</th>
            <th>Multiple</th>
          </tr>
        </thead>
        <tbody>
  `;

  if (filtered.length === 0) {
    html += `<tr><td colspan="9" class="empty-state">No protocols match your filters.</td></tr>`;
  } else {
    filtered.forEach((r, idx) => {
      const chainsStr = Array.isArray(r.chains) ? r.chains.join(", ") : "";
      const mult = r.multiple != null && !isNaN(r.multiple) ? r.multiple.toFixed(2) + "x" : "—";
      html += `
        <tr>
          <td>${idx + 1}</td>
          <td><a href="?view=detail&id=${esc(r.slug)}">${esc(r.name)}</a></td>
          <td>${esc(r.category)}</td>
          <td>${esc(chainsStr)}</td>
          <td>${fmtUSD(r.tvl_usd)}</td>
          <td>${fmtPct(r.change_7d)}</td>
          <td>${fmtAge(r.age_days)}</td>
          <td>${fmtUSD(r.implied_value_usd)}</td>
          <td>${mult}</td>
        </tr>
      `;
    });
  }

  html += `
        </tbody>
      </table>
    </div>
  `;

  board.innerHTML = html;
};

const wireControls = (data, onChange) => {
  const qInput = document.getElementById("q");
  const catSelect = document.getElementById("cat");
  const chainSelect = document.getElementById("chain");
  const sortSelect = document.getElementById("sort");
  const wlCheckbox = document.getElementById("wlOnly");

  if (catSelect && data.categories) {
    let opts = '<option value="">All Categories</option>';
    data.categories.forEach((c) => {
      opts += `<option value="${esc(c)}">${esc(c)}</option>`;
    });
    catSelect.innerHTML = opts;
  }

  if (chainSelect && data.chains) {
    let opts = '<option value="">All Chains</option>';
    data.chains.forEach((ch) => {
      opts += `<option value="${esc(ch)}">${esc(ch)}</option>`;
    });
    chainSelect.innerHTML = opts;
  }

  const state = getState();
  if (qInput) qInput.value = state.q;
  if (catSelect) catSelect.value = state.cat;
  if (chainSelect) chainSelect.value = state.chain;
  if (sortSelect) sortSelect.value = state.sort;
  if (wlCheckbox) wlCheckbox.checked = state.wl;

  const updateStateAndRender = () => {
    const params = new URLSearchParams();
    if (qInput && qInput.value) params.set("q", qInput.value);
    if (catSelect && catSelect.value) params.set("cat", catSelect.value);
    if (chainSelect && chainSelect.value) params.set("chain", chainSelect.value);
    if (sortSelect && sortSelect.value && sortSelect.value !== "tvl") params.set("sort", sortSelect.value);
    if (wlCheckbox && wlCheckbox.checked) params.set("wl", "1");

    const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);

    if (typeof onChange === "function") {
      onChange(getState());
    }
  };

  if (qInput) qInput.addEventListener("input", updateStateAndRender);
  if (catSelect) catSelect.addEventListener("change", updateStateAndRender);
  if (chainSelect) chainSelect.addEventListener("change", updateStateAndRender);
  if (sortSelect) sortSelect.addEventListener("change", updateStateAndRender);
  if (wlCheckbox) wlCheckbox.addEventListener("change", updateStateAndRender);
};
function renderDetail(row) {
  const container = document.getElementById('detail');
  if (!container) return;
  const chains = (row.chains || []).map(c => `<span class="badge chain">${esc(c)}</span>`).join(' ');
  const stats = [
    { label: 'TVL', val: fmtUSD(row.tvl_usd) },
    { label: '7D Change', val: fmtPct(row.change_7d) },
    { label: 'Age', val: fmtAge(row.age_days) },
    { label: 'Listed Date', val: esc(row.listed_at) },
    { label: 'Implied Value', val: fmtUSD(row.implied_value_usd) },
    { label: 'Category Multiple', val: (row.multiple ?? 0).toFixed(2) + 'x' }
  ].map(s => `<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value">${s.val}</div></div>`).join('');

  container.innerHTML = `
    <div class="detail-nav"><a href="#" id="back-link">&larr; Back to Board</a></div>
    <div class="detail-header">
      <h2>${esc(row.name)}</h2>
      <div class="badges"><span class="badge category">${esc(row.category)}</span> ${chains}</div>
    </div>
    <div class="stat-grid">${stats}</div>
    <div class="model-breakdown">
      <h3>Valuation Model</h3>
      <p>Base Valuation: ${fmtUSD(row.tvl_usd)} (TVL) &times; ${(row.multiple ?? 0).toFixed(2)}x (Multiple) = ${fmtUSD(row.tvl_usd * (row.multiple || 0))}</p>
      <p>Growth Multiplier: &times; ${(row.growth_multiplier ?? 1).toFixed(2)}</p>
      <p>Maturity Multiplier: &times; ${(row.maturity_multiplier ?? 1).toFixed(2)}</p>
      <p><strong>Final Implied Value: ${fmtUSD(row.implied_value_usd)}</strong></p>
      <p class="comparables-note">Category comparables: median multiple for ${esc(row.category)} is ${(window.RADAR.comparables.find(c => c.category === row.category)?.median ?? row.multiple).toFixed(2)}x across ${window.RADAR.comparables.find(c => c.category === row.category)?.n || 0} protocols.</p>
    </div>
    <div class="farm-plan">
      <h3>Farm Plan</h3>
      <ol>${(row.farm_steps || []).map(step => `<li>${esc(step.text)} - Cost: ${esc(step.cost)}, Time: ${esc(step.time)}</li>`).join('')}</ol>
    </div>
  `;
  const back = document.getElementById('back-link');
  if (back) {
    back.addEventListener('click', e => {
      e.preventDefault();
      const s = getState();
      s.view = 'board';
      s.id = '';
      window.location.hash = '';
      history.replaceState(null, '', window.location.pathname);
      document.getElementById('detail-view').style.display = 'none';
      document.getElementById('board-view').style.display = '';
      renderBoard(window.RADAR.rows, s, window.RADAR.watchlist_slugs);
    });
  }
}

function renderLive() {
  const container = document.getElementById('live');
  if (!container) return;
  const rows = (window.RADAR.live || []).map(item => {
    const ratio = item.tvl_usd ? (item.mcap_usd / item.tvl_usd) : 0;
    const chains = (item.chains || []).map(c => `<span class="badge chain">${esc(c)}</span>`).join(' ');
    return `<tr>
      <td><strong>${esc(item.name)}</strong><br><small>${chains}</small></td>
      <td>${esc(item.category)}</td>
      <td>${fmtUSD(item.tvl_usd)}</td>
      <td>${fmtUSD(item.mcap_usd)}</td>
      <td>${ratio.toFixed(2)}x</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <p class="live-note">Note: These protocols already trade and are not ranked.</p>
    <table class="data-table">
      <thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market Cap</th><th>MCap / TVL</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderComparables() {
  const container = document.getElementById('comparables');
  if (!container) return;
  const rows = (window.RADAR.comparables || []).map(c => `
    <tr>
      <td>${esc(c.category)}</td>
      <td>${c.n}</td>
      <td>${(c.median ?? 0).toFixed(2)}x</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Category</th><th>Protocols Counted</th><th>Median Multiple</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderMethod() {
  const methodContainer = document.getElementById('method');
  if (methodContainer) {
    methodContainer.innerHTML = `<p>The valuation model computes a protocol's implied value by multiplying its Total Value Locked (TVL) by its category's median comparable multiple. This base valuation is then adjusted by a growth multiplier (rewarding momentum) and a maturity multiplier (accounting for protocol age and history). A valuation floor is applied where appropriate.</p>`;
  }
  const metaContainer = document.getElementById('meta-line');
  if (metaContainer) {
    metaContainer.textContent = `Snapshot as of ${window.RADAR.as_of} | Floor: ${fmtUSD(window.RADAR.floor_usd)} | Watchlist Size: ${window.RADAR.watchlist_size} | Board Size: ${window.RADAR.board_size}`;
  }
}

const st = getState();
const banner = document.getElementById('filter-banner');
if (banner) {
  if (st.q || (st.cat && st.cat !== 'all') || (st.chain && st.chain !== 'all') || (st.filter && st.filter !== 'all') || st.wl) {
    banner.style.display = 'block';
    banner.textContent = 'Filters active';
  } else {
    banner.style.display = 'none';
  }
}

const detailEl = document.getElementById('detail');
const boardEl = document.getElementById('board');
if (st.view === 'detail' && st.id) {
  const matched = (window.RADAR.rows || []).find(r => r.slug === st.id);
  if (matched) {
    if (boardEl) boardEl.style.display = 'none';
    if (detailEl) {
      detailEl.style.display = 'block';
      renderDetail(matched);
    }
  } else {
    if (detailEl) detailEl.style.display = 'none';
    if (boardEl) boardEl.style.display = 'block';
    renderBoard(window.RADAR.rows, st, window.RADAR.watchlist_slugs);
  }
} else {
  if (detailEl) detailEl.style.display = 'none';
  if (boardEl) boardEl.style.display = 'block';
  renderBoard(window.RADAR.rows, st, window.RADAR.watchlist_slugs);
}

renderLive();
renderComparables();
renderMethod();
wireControls(window.RADAR, (ns) => renderBoard(window.RADAR.rows, ns, window.RADAR.watchlist_slugs));
