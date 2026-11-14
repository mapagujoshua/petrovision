import { Buffer } from "node:buffer";
import { firebase } from "./firebase.js";
import { activeSessionOwners, activeSessions, users } from "./store.js";
const firestore = firebase?.firestore;
const userCollection = "users";
const emailCollection = "userEmails";
const sessionCollection = "sessions";
function emailDocumentId(email) {
    return Buffer.from(email).toString("base64url");
}
export async function createUser(user) {
    if (!firestore) {
        if ([...users.values()].some((candidate) => candidate.email === user.email))
            return false;
        users.set(user.id, user);
        return true;
    }
    const userRef = firestore.collection(userCollection).doc(user.id);
    const emailRef = firestore.collection(emailCollection).doc(emailDocumentId(user.email));
    const created = await firestore.runTransaction(async (transaction) => {
        const existingEmail = await transaction.get(emailRef);
        if (existingEmail.exists)
            return false;
        transaction.create(userRef, user);
        transaction.create(emailRef, { userId: user.id });
        return true;
    });
    if (created)
        users.set(user.id, user);
    return created;
}
export async function findUserByEmail(email) {
    if (!firestore)
        return [...users.values()].find((user) => user.email === email);
    const emailDoc = await firestore.collection(emailCollection).doc(emailDocumentId(email)).get();
    const userId = emailDoc.data()?.userId;
    if (typeof userId !== "string")
        return undefined;
    return getUser(userId);
}
export async function getUser(userId) {
    if (!firestore)
        return users.get(userId);
    const snapshot = await firestore.collection(userCollection).doc(userId).get();
    if (!snapshot.exists) {
        users.delete(userId);
        return undefined;
    }
    const user = snapshot.data();
    users.set(user.id, user);
    return user;
}
export async function getAllUsers() {
    if (!firestore)
        return [...users.values()];
    const snapshot = await firestore.collection(userCollection).get();
    const allUsers = snapshot.docs.map((document) => document.data());
    users.clear();
    for (const user of allUsers)
        users.set(user.id, user);
    return allUsers;
}
export async function saveUser(user) {
    if (firestore) {
        const userRef = firestore.collection(userCollection).doc(user.id);
        await firestore.runTransaction(async (transaction) => {
            const previousSnapshot = await transaction.get(userRef);
            const previous = previousSnapshot.data();
            if (previous && previous.email !== user.email) {
                const nextEmailRef = firestore.collection(emailCollection).doc(emailDocumentId(user.email));
                const existingEmail = await transaction.get(nextEmailRef);
                if (existingEmail.exists && existingEmail.data()?.userId !== user.id) {
                    throw new Error("Email already registered");
                }
                const previousEmailRef = firestore.collection(emailCollection).doc(emailDocumentId(previous.email));
                transaction.delete(previousEmailRef);
                transaction.set(nextEmailRef, { userId: user.id });
            }
            else {
                transaction.set(firestore.collection(emailCollection).doc(emailDocumentId(user.email)), { userId: user.id });
            }
            transaction.set(userRef, user);
        });
    }
    users.set(user.id, user);
}
export async function deleteUserAccount(userId) {
    const user = await getUser(userId);
    if (!user)
        return false;
    await revokeUserSessions(userId);
    if (firestore) {
        const userRef = firestore.collection(userCollection).doc(userId);
        await firestore.runTransaction(async (transaction) => {
            const userSnapshot = await transaction.get(userRef);
            if (!userSnapshot.exists)
                return;
            const currentEmail = userSnapshot.data()?.email;
            const emailRef = typeof currentEmail === "string"
                ? firestore.collection(emailCollection).doc(emailDocumentId(currentEmail))
                : undefined;
            const emailSnapshot = emailRef ? await transaction.get(emailRef) : undefined;
            transaction.delete(userRef);
            if (emailRef && emailSnapshot?.data()?.userId === userId)
                transaction.delete(emailRef);
        });
    }
    users.delete(userId);
    return true;
}
export async function createSession(sessionId, userId) {
    if (firestore) {
        await firestore.collection(sessionCollection).doc(sessionId).create({ userId, createdAt: new Date().toISOString() });
    }
    activeSessions.add(sessionId);
    activeSessionOwners.set(sessionId, userId);
}
export async function hasSession(sessionId) {
    if (!firestore)
        return activeSessions.has(sessionId);
    const snapshot = await firestore.collection(sessionCollection).doc(sessionId).get();
    return snapshot.exists;
}
export async function revokeSession(sessionId) {
    if (firestore)
        await firestore.collection(sessionCollection).doc(sessionId).delete();
    activeSessions.delete(sessionId);
    activeSessionOwners.delete(sessionId);
}
export async function revokeUserSessions(userId) {
    if (firestore) {
        const snapshot = await firestore.collection(sessionCollection).where("userId", "==", userId).get();
        await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
        snapshot.docs.forEach((document) => {
            activeSessions.delete(document.id);
            activeSessionOwners.delete(document.id);
        });
        return;
    }
    for (const [sessionId, ownerId] of activeSessionOwners) {
        if (ownerId === userId) {
            activeSessions.delete(sessionId);
            activeSessionOwners.delete(sessionId);
        }
    }
}
