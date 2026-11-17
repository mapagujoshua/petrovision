import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app.js";
import { validatePassword as validatePasswordPolicy } from "../src/password-policy.js";
import { priceReports, resetStore, users, vehicles } from "../src/store.js";

afterEach(resetStore);

test("health endpoint reports ready", async () => {
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.ok(["memory", "firestore"].includes(response.body.persistence));
});

test("API root returns service information", async () => {
  const response = await request(app).get("/");
  assert.equal(response.status, 200);
  assert.equal(response.body.name, "PetroVision API");
  assert.equal(response.body.health, "/health");
});

test("server serves the UI assets and allows configured local Live Server origins", async () => {
  const entryPage = await request(app).get("/index.html");
  assert.equal(entryPage.status, 200);
  assert.match(entryPage.text, /home\.html/);
  const page = await request(app).get("/home.html");
  assert.equal(page.status, 200);
  assert.match(page.text, /js\/api\.js/);
  assert.match(page.text, /id="price-table-body"/);
  const loginPage = await request(app).get("/login.html");
  assert.equal(loginPage.status, 200);
  const script = await request(app).get("/js/api.js");
  assert.equal(script.status, 200);
  const preflight = await request(app).options("/api/auth/login").set("Origin", "http://localhost:5500");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:5500");
});

test("registration returns a bearer token and profile without password hash", async () => {
  const response = await request(app).post("/api/auth/register").send({ email: "driver@example.com", password: "Valid-pass1!", displayName: "Driver" });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, "driver@example.com");
  assert.equal("passwordHash" in response.body.user, false);
  const profile = await request(app).get("/api/users/me").set("Authorization", `Bearer ${response.body.accessToken}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.displayName, "Driver");
  const rewards = await request(app).get("/api/rewards/me").set("Authorization", `Bearer ${response.body.accessToken}`);
  assert.equal(rewards.body.points, 5);
});

test("registration and password changes reject passwords outside the policy", async () => {
  const acceptedSpecialCharacters = "!@#$%^&*()_+-=[]{};:'\",.<>/?\\|`~";
  for (const specialCharacter of acceptedSpecialCharacters) {
    assert.equal(validatePasswordPolicy(`Abcd123${specialCharacter}`).valid, true, `Expected ${specialCharacter} to be accepted as special`);
  }

  const invalidPasswords = [
    "short1!",
    "lowercase1!",
    "UPPERCASE1!",
    "NoNumber!!",
    "NoSpecial1",
    "Has space1A!",
    `A1!${"a".repeat(62)}`,
    "Password1é"
  ];
  for (const [index, password] of invalidPasswords.entries()) {
    const response = await request(app).post("/api/auth/register")
      .send({ email: `weak-${index}@example.com`, password, displayName: "Weak Password" });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.");
  }

  const registration = await request(app).post("/api/auth/register")
    .send({ email: "password-policy@example.com", password: "Valid-pass1!", displayName: "Policy Test" })
    .expect(201);
  const headers = { Authorization: `Bearer ${registration.body.accessToken}` };
  await request(app).post("/api/users/me/password").set(headers)
    .send({ currentPassword: "Valid-pass1!", newPassword: "weakpass" })
    .expect(400)
    .then((response) => assert.equal(response.body.error, "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character."));
});

test("login continues to accept existing passwords that do not meet the new policy", async () => {
  const registration = await request(app).post("/api/auth/register")
    .send({ email: "legacy-password@example.com", password: "Valid-pass1!", displayName: "Legacy User" })
    .expect(201);
  users.get(registration.body.user.id)!.passwordHash = await bcrypt.hash("oldpass", 10);
  await request(app).post("/api/auth/login")
    .send({ email: "legacy-password@example.com", password: "oldpass" })
    .expect(200);
});

test("UI-facing station and reward APIs return a driver's updated records", async () => {
  const registration = await request(app).post("/api/auth/register").send({ email: "stations@example.com", password: "Valid-pass1!", displayName: "Station Driver" });
  const headers = { Authorization: `Bearer ${registration.body.accessToken}` };
  const priceReport = await request(app).post("/api/stations/station-demo/price-reports").set(headers).send({ fuelType: "Diesel", price: 58 }).expect(201);
  const availabilityReport = await request(app).post("/api/stations/station-demo/availability").set(headers).send({ fuelType: "Diesel", status: "Low Stock" }).expect(201);
  const reviewer = await request(app).post("/api/auth/register").send({ email: "stations-reviewer@example.com", password: "Valid-pass1!", displayName: "Reviewer" });
  users.get(reviewer.body.user.id)!.role = "admin";
  const adminHeaders = { Authorization: `Bearer ${reviewer.body.accessToken}` };

  const pendingStations = await request(app).get("/api/stations").set(headers);
  assert.deepEqual(pendingStations.body[0].priceReports, []);
  assert.deepEqual(pendingStations.body[0].availabilityReports, []);
  await request(app).put(`/api/price-reports/${priceReport.body.id}/verify`).set(adminHeaders).send({ verified: true }).expect(200);
  await request(app).put(`/api/admin/availability-reports/${availabilityReport.body.id}/status`).set(adminHeaders).send({ status: "approved" }).expect(200);
  const stations = await request(app).get("/api/stations").set(headers);
  assert.equal(stations.status, 200);
  assert.equal(stations.body[0].priceReports[0].price, 58);
  assert.equal(stations.body[0].availabilityReports[0].status, "Low Stock");
  const activity = await request(app).get("/api/rewards/activity").set(headers);
  assert.deepEqual(activity.body.map((entry: { reason: string }) => entry.reason).sort(), ["availability-report", "price-report", "signup"]);
});

test("guests can read approved station prices without contributor details", async () => {
  const reporter = await request(app).post("/api/auth/register").send({ email: "public-reporter@example.com", password: "Valid-pass1!", displayName: "Reporter" });
  const reviewer = await request(app).post("/api/auth/register").send({ email: "public-reviewer@example.com", password: "Valid-pass1!", displayName: "Reviewer" });
  users.get(reviewer.body.user.id)!.role = "admin";
  const report = await request(app).post("/api/stations/station-demo/price-reports")
    .set("Authorization", `Bearer ${reporter.body.accessToken}`)
    .send({ fuelType: "Diesel", price: 58 });

  const beforeApproval = await request(app).get("/api/public/stations");
  assert.equal(beforeApproval.status, 200);
  assert.deepEqual(beforeApproval.body[0].priceReports, []);

  await request(app).put(`/api/price-reports/${report.body.id}/verify`)
    .set("Authorization", `Bearer ${reviewer.body.accessToken}`)
    .send({ verified: true })
    .expect(200);

  const publicStations = await request(app).get("/api/public/stations");
  assert.equal(publicStations.status, 200);
  assert.equal(publicStations.body[0].priceReports[0].price, 58);
  assert.equal("userId" in publicStations.body[0].priceReports[0], false);
  assert.equal("createdBy" in publicStations.body[0], false);
});

test("vehicle records are private to their owner", async () => {
  const first = await request(app).post("/api/auth/register").send({ email: "first@example.com", password: "Valid-pass1!", displayName: "First" });
  const second = await request(app).post("/api/auth/register").send({ email: "second@example.com", password: "Valid-pass1!", displayName: "Second" });
  const created = await request(app).post("/api/vehicles").set("Authorization", `Bearer ${first.body.accessToken}`).send({ make: "Toyota", model: "Prius", year: 2024, fuelType: "gasoline", fuelEfficiency: 20 });
  assert.equal(created.status, 201);
  const list = await request(app).get("/api/vehicles").set("Authorization", `Bearer ${second.body.accessToken}`);
  assert.deepEqual(list.body, []);
});

test("logout revokes the active access token", async () => {
  const login = await request(app).post("/api/auth/register").send({ email: "logout@example.com", password: "Valid-pass1!", displayName: "Driver" });
  const token = login.body.accessToken as string;
  assert.equal((await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`)).status, 204);
  assert.equal((await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`)).status, 401);
});

test("profile reports are limited to the authenticated user", async () => {
  const first = await request(app).post("/api/auth/register").send({ email: "profile-one@example.com", password: "Valid-pass1!", displayName: "First" });
  const second = await request(app).post("/api/auth/register").send({ email: "profile-two@example.com", password: "Valid-pass1!", displayName: "Second" });
  await request(app).post("/api/stations/station-demo/price-reports")
    .set("Authorization", `Bearer ${first.body.accessToken}`)
    .send({ fuelType: "Diesel", price: 58 })
    .expect(201);
  await request(app).post("/api/stations/station-demo/price-reports")
    .set("Authorization", `Bearer ${second.body.accessToken}`)
    .send({ fuelType: "Diesel", price: 59 })
    .expect(201);

  const reports = await request(app).get("/api/users/me/reports")
    .set("Authorization", `Bearer ${first.body.accessToken}`)
    .expect(200);
  assert.equal(reports.body.length, 1);
  assert.equal(reports.body[0].price, 58);
  assert.equal(reports.body[0].status, "pending");
});

test("password changes require the current password and revoke sessions", async () => {
  const registration = await request(app).post("/api/auth/register").send({ email: "password@example.com", password: "Valid-pass1!", displayName: "Driver" });
  const headers = { Authorization: `Bearer ${registration.body.accessToken}` };

  await request(app).post("/api/users/me/password").set(headers)
    .send({ currentPassword: "wrong-password", newPassword: "Another-pass2@" })
    .expect(400);
  await request(app).get("/api/users/me").set(headers).expect(200);

  await request(app).post("/api/users/me/password").set(headers)
    .send({ currentPassword: "Valid-pass1!", newPassword: "Another-pass2@" })
    .expect(204);
  await request(app).get("/api/users/me").set(headers).expect(401);
  await request(app).post("/api/auth/login")
    .send({ email: "password@example.com", password: "Another-pass2@" })
    .expect(200);
});

test("account deletion anonymizes contributions and removes private account data", async () => {
  const registration = await request(app).post("/api/auth/register").send({ email: "delete@example.com", password: "Valid-pass1!", displayName: "Driver" });
  const headers = { Authorization: `Bearer ${registration.body.accessToken}` };
  const report = await request(app).post("/api/stations/station-demo/price-reports")
    .set(headers)
    .send({ fuelType: "Diesel", price: 58 })
    .expect(201);
  const vehicle = await request(app).post("/api/vehicles").set(headers)
    .send({ make: "Toyota", model: "Sedan", year: 2024, fuelType: "Diesel", fuelEfficiency: 12 })
    .expect(201);

  await request(app).delete("/api/users/me").set(headers)
    .send({ currentPassword: "wrong-password", confirmation: "DELETE" })
    .expect(400);
  assert.equal((await request(app).get("/api/users/me").set(headers)).status, 200);

  await request(app).delete("/api/users/me").set(headers)
    .send({ currentPassword: "Valid-pass1!", confirmation: "DELETE" })
    .expect(204);
  assert.equal(users.has(registration.body.user.id), false);
  assert.equal(vehicles.has(vehicle.body.id), false);
  assert.equal(priceReports.get(report.body.id)?.userId, "deleted-account");
  await request(app).get("/api/users/me").set(headers).expect(401);
  await request(app).post("/api/auth/login")
    .send({ email: "delete@example.com", password: "Valid-pass1!" })
    .expect(401);
});

test("authorization reflects current role and suspension status", async () => {
  const registration = await request(app).post("/api/auth/register").send({ email: "roles@example.com", password: "Valid-pass1!", displayName: "Driver" });
  const token = registration.body.accessToken as string;
  const user = users.get(registration.body.user.id)!;
  user.role = "admin";
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`)).status, 200);
  user.role = "user";
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`)).status, 403);
  user.suspended = true;
  assert.equal((await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`)).status, 401);
});

test("configured bootstrap email receives admin access", async () => {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "owner@example.com";
  try {
    const registration = await request(app).post("/api/auth/register").send({ email: "owner@example.com", password: "Valid-pass1!", displayName: "Owner" });
    assert.equal(registration.body.user.role, "admin");
    assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${registration.body.accessToken}`)).status, 200);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  }
});

test("admins can verify another driver's report while contributors cannot", async () => {
  const reporter = await request(app).post("/api/auth/register").send({ email: "reporter@example.com", password: "Valid-pass1!", displayName: "Reporter" });
  const reviewer = await request(app).post("/api/auth/register").send({ email: "reviewer@example.com", password: "Valid-pass1!", displayName: "Reviewer" });
  users.get(reviewer.body.user.id)!.role = "admin";
  const report = await request(app).post("/api/stations/station-demo/price-reports")
    .set("Authorization", `Bearer ${reporter.body.accessToken}`)
    .send({ fuelType: "gasoline", price: 1.45 });
  const ownReview = await request(app).put(`/api/price-reports/${report.body.id}/verify`)
    .set("Authorization", `Bearer ${reporter.body.accessToken}`)
    .send({ verified: true });
  assert.equal(ownReview.status, 403);
  const otherReview = await request(app).put(`/api/price-reports/${report.body.id}/verify`)
    .set("Authorization", `Bearer ${reviewer.body.accessToken}`)
    .send({ verified: true });
  assert.equal(otherReview.status, 200);
  assert.equal(otherReview.body.verified, true);
});

test("price contributions earn points, trigger matching alerts, and can be redeemed", async () => {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "rewards-admin@example.com";
  try {
    const admin = await request(app).post("/api/auth/register").send({ email: "rewards-admin@example.com", password: "Valid-pass1!", displayName: "Admin" });
    const adminHeaders = { Authorization: `Bearer ${admin.body.accessToken}` };
    await request(app).put("/api/admin/rewards/rules/price-report").set(adminHeaders).send({ points: 100 }).expect(200);

    const driver = await request(app).post("/api/auth/register").send({ email: "rewards-driver@example.com", password: "Valid-pass1!", displayName: "Driver" });
    const headers = { Authorization: `Bearer ${driver.body.accessToken}` };
    const subscription = await request(app).post("/api/notifications/subscribe").set(headers).send({ stationId: "station-demo", fuelType: "gasoline", maxPrice: 1.5, fcmToken: "test-token" });
    assert.equal(subscription.status, 201);
    assert.equal("fcmToken" in subscription.body, false);

    const priceReport = await request(app).post("/api/stations/station-demo/price-reports").set(headers).send({ fuelType: "gasoline", price: 1.45 }).expect(201);
    const pendingInbox = await request(app).get("/api/notifications").set(headers);
    assert.equal(pendingInbox.body.notifications.length, 0);
    await request(app).put(`/api/price-reports/${priceReport.body.id}/verify`).set(adminHeaders).send({ verified: true }).expect(200);
    const account = await request(app).get("/api/rewards/me").set(headers);
    assert.equal(account.body.points, 107);
    assert.equal(account.body.contributionStats["price-report"], 1);

    const inbox = await request(app).get("/api/notifications").set(headers);
    assert.equal(inbox.body.notifications.length, 1);
    assert.equal(inbox.body.unreadCount, 1);

    const redemption = await request(app).post("/api/rewards/redeem").set(headers).send({ rewardId: "coffee-voucher" });
    assert.equal(redemption.status, 201);
    assert.equal(redemption.body.pointsRemaining, 7);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  }
});

test("admin moderation updates dashboard, station logs, and audit trail", async () => {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "moderator@example.com";
  try {
    const admin = await request(app).post("/api/auth/register").send({ email: "moderator@example.com", password: "Valid-pass1!", displayName: "Moderator" });
    const driver = await request(app).post("/api/auth/register").send({ email: "moderated-driver@example.com", password: "Valid-pass1!", displayName: "Driver" });
    const userHeaders = { Authorization: `Bearer ${driver.body.accessToken}` };
    const adminHeaders = { Authorization: `Bearer ${admin.body.accessToken}` };
    const report = await request(app).post("/api/stations/station-demo/price-reports").set(userHeaders).send({ fuelType: "diesel", price: 1.6 });

    const pending = await request(app).get("/api/admin/reports?status=pending&stationId=station-demo").set(adminHeaders);
    assert.equal(pending.body.length, 1);
    await request(app).put(`/api/admin/reports/${report.body.id}/status`).set(adminHeaders).send({ status: "rejected" }).expect(200);

    const dashboard = await request(app).get("/api/admin/dashboard").set(adminHeaders);
    assert.equal(dashboard.body.pendingReports, 0);
    assert.equal(dashboard.body.flaggedReports, 1);
    assert.equal(dashboard.body.topContributors[0].user.email, "moderated-driver@example.com");
    const stationLogs = await request(app).get("/api/admin/station-logs?stationId=station-demo").set(adminHeaders);
    assert.ok(stationLogs.body.length >= 2);
    const audit = await request(app).get("/api/admin/audit-logs").set(adminHeaders);
    assert.ok(audit.body.some((entry: { action: string }) => entry.action === "price-report.rejected"));
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  }
});