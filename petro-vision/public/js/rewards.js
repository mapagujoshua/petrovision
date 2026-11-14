requireAuth();

function initials(fullName) {
  return fullName.trim().split(/\s+/).map(word => word[0]).join("").slice(0, 2).toUpperCase();
}

function renderRewardCatalog(catalog, points) {
  const list = document.getElementById("reward-list");
  list.setAttribute("aria-busy", "false");
  if (!catalog.length) {
    list.innerHTML = `<div class="empty-state reward-empty"><h2>No rewards available yet</h2><p>Check back later for new ways to use your points.</p></div>`;
    return;
  }
  list.innerHTML = catalog.map(reward => `
    <article class="card reward-card">
      <span class="eyebrow">Community reward</span>
      <h3>${escapeHtml(reward.name)}</h3>
      <p>${escapeHtml(reward.description || "A reward for your community contributions.")}</p>
      <span class="reward-card-cost">${Number(reward.pointsCost).toLocaleString()} points</span>
      <button class="btn btn-secondary" type="button" data-redeem="${escapeHtml(reward.id)}"
        ${points < reward.pointsCost ? "disabled" : ""}>Redeem</button>
    </article>
  `).join("");
}

async function loadRewards() {
  const [account, leaderboard, activity, user, rules, catalog] = await Promise.all([
    getRewardAccount(),
    getLeaderboard(),
    getActivity(),
    getCurrentUser(),
    getPublicRewardRules(),
    getRewardCatalog()
  ]);
  const points = Number(account.points) || 0;
  const pointsById = Object.fromEntries(rules.map(rule => [rule.id, rule.points]));
  const guide = [
    ["Report a fuel price", pointsById["price-report"]],
    ["Update station availability", pointsById["availability-report"]],
    ["Log a refuel", pointsById["refuel-log"]],
    ["Save a trip", pointsById["trip-log"]],
    ["Add a vehicle", pointsById["new-vehicle"]],
    ["Create a price alert", pointsById["new-alert"]]
  ];
  document.getElementById("points-guide").innerHTML = guide
    .map(([label, amount]) => `<li><span>${escapeHtml(label)}</span><strong>+${Number(amount) || 0} pts</strong></li>`)
    .join("");

  const badge = getBadge(points);
  const badgeIndex = BADGES.indexOf(badge);
  const nextBadge = BADGES[badgeIndex + 1];
  document.getElementById("my-badge").textContent = badge.name;
  document.getElementById("my-badge").dataset.tier = String(badgeIndex);
  document.getElementById("my-points").textContent = `${points.toLocaleString()} pts`;

  const nextReward = catalog
    .filter(reward => Number(reward.pointsCost) > points)
    .sort((a, b) => Number(a.pointsCost) - Number(b.pointsCost))[0];
  const nextMilestone = [
    nextReward && { points: Number(nextReward.pointsCost), label: nextReward.name },
    nextBadge && { points: nextBadge.min, label: nextBadge.name }
  ].filter(Boolean).sort((a, b) => a.points - b.points)[0];
  const progress = nextMilestone ? Math.min(100, points / nextMilestone.points * 100) : 100;
  document.getElementById("progress-fill").value = progress;
  document.getElementById("progress-value").textContent = `${Math.floor(progress)}%`;
  document.getElementById("progress-hint").textContent = nextMilestone
    ? `${(nextMilestone.points - points).toLocaleString()} points to ${nextMilestone.label}`
    : "You have reached the highest reward milestone.";

  const leaderboardElement = document.getElementById("leaderboard");
  leaderboardElement.innerHTML = leaderboard.length
    ? leaderboard.map((entry, index) => {
        const isMe = entry.user.id === user.id;
        return `
          <div class="leaderboard-row${isMe ? " me" : ""}">
            <span class="rank">${index + 1}</span>
            <span class="avatar">${escapeHtml(initials(entry.user.displayName))}</span>
            <span class="name">${escapeHtml(entry.user.displayName)}${isMe ? " (you)" : ""}</span>
            <span class="pts">${Number(entry.points).toLocaleString()} pts</span>
          </div>
        `;
      }).join("")
    : `<div class="empty-state"><p>No contributors yet.</p></div>`;

  const labels = {
    signup: "Created an account",
    "price-report": "Reported a fuel price",
    "availability-report": "Updated station availability",
    "station-suggestion": "Suggested a station",
    "new-vehicle": "Added a vehicle",
    "trip-log": "Saved a trip",
    "refuel-log": "Logged a refuel",
    "new-alert": "Created a price alert"
  };
  document.getElementById("activity-feed").innerHTML = activity.length
    ? activity.slice(0, 10).map(item => `
        <div class="activity-item">
          <span>${escapeHtml(labels[item.reason] || item.reason)}${item.date
            ? `<time datetime="${escapeHtml(item.date)}" title="${escapeHtml(new Date(item.date).toLocaleString())}">${escapeHtml(window.PetroVisionUI?.formatRelativeTime(item.date) || "")}</time>`
            : ""}</span>
          <span class="activity-points">+${Number(item.amount).toLocaleString()}</span>
        </div>
      `).join("")
    : `<div class="empty-state"><p>No recent activity yet.</p></div>`;

  renderRewardCatalog(catalog, points);
}

document.getElementById("reward-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-redeem]");
  if (!button) return;
  window.PetroVisionUI?.setBusy(button, true);
  try {
    await redeemReward(button.dataset.redeem);
    window.PetroVisionUI?.toast("Reward redeemed.", "success");
    await loadRewards();
  } catch (error) {
    window.PetroVisionUI?.toast(error.message || "Could not redeem this reward.", "error");
    window.PetroVisionUI?.setBusy(button, false);
  }
});

loadRewards().catch(error => {
  document.getElementById("reward-list").setAttribute("aria-busy", "false");
  document.getElementById("reward-list").innerHTML =
    `<div class="banner banner-danger" role="alert">${escapeHtml(error.message || "Could not load rewards.")}</div>`;
  window.PetroVisionUI?.toast(error.message || "Could not load rewards.", "error");
});
