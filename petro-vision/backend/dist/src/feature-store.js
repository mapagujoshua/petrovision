import { firebase } from "./firebase.js";
const firestore = firebase?.firestore;
export async function loadRecord(collectionName, records, id) {
    if (!firestore)
        return records.get(id);
    const snapshot = await firestore.collection(collectionName).doc(id).get();
    if (!snapshot.exists) {
        records.delete(id);
        return undefined;
    }
    const record = snapshot.data();
    records.set(id, record);
    return record;
}
export async function loadCollection(collectionName, records, seedWhenEmpty = false) {
    if (!firestore)
        return [...records.values()];
    const collection = firestore.collection(collectionName);
    let snapshot = await collection.get();
    if (snapshot.empty && seedWhenEmpty && records.size > 0) {
        const batch = firestore.batch();
        for (const [id, record] of records)
            batch.set(collection.doc(id), record);
        await batch.commit();
        snapshot = await collection.get();
    }
    const loaded = snapshot.docs.map((document) => document.data());
    records.clear();
    for (const record of loaded) {
        const id = record.id;
        if (typeof id === "string")
            records.set(id, record);
        else if ("userId" in record && typeof record.userId === "string") {
            records.set(record.userId, record);
        }
    }
    return loaded;
}
export async function loadOwnedRecords(collectionName, records, ownerId) {
    if (!firestore)
        return [...records.values()].filter((record) => record.ownerId === ownerId);
    const snapshot = await firestore.collection(collectionName).where("ownerId", "==", ownerId).get();
    const loaded = snapshot.docs.map((document) => document.data());
    for (const record of loaded)
        records.set(record.id, record);
    return loaded;
}
export async function loadMatchingRecords(collectionName, records, field, value) {
    if (!firestore)
        return [...records.values()].filter((record) => record[field] === value);
    const snapshot = await firestore.collection(collectionName).where(field, "==", value).get();
    const loaded = snapshot.docs.map((document) => document.data());
    for (const record of loaded)
        records.set(record.id, record);
    return loaded;
}
export async function saveRecord(collectionName, records, id, record) {
    if (firestore)
        await firestore.collection(collectionName).doc(id).set(record);
    records.set(id, record);
}
export async function deleteRecord(collectionName, records, id) {
    if (firestore)
        await firestore.collection(collectionName).doc(id).delete();
    records.delete(id);
}
