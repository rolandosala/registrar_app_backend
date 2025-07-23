import express from 'express';
import admin from 'firebase-admin';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer'

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const serviceAccount = JSON.parse(
    await import('fs/promises')
        .then(fs => fs.readFile(process.env.SERVICE_ACCOUNT_KEY_PATH, 'utf8'))
);

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.USERMAIL,
        pass: process.env.PASSKEY
    }
})

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

app.get('/', (req, res) => {
    res.send('Firebase admin + Express backend running!');
});

app.get('/faq', async (req, res) => {
    try {
        const faqRef = db.collection('FAQ');
        const snapshot = await faqRef.get();

        if (snapshot.empty) {
            return res.status(404).json({ message: 'No FAQ' })
        }

        const faqs = [];
        snapshot.forEach(doc => {
            faqs.push({ id: doc.id, ...doc.data() });
        });

        res.json(faqs);
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Internal Server Error' })
    }
});

app.post('/createRequest', async (req, res) => {
    try {
        const dataArray = req.body;
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            return res.status(400).json({ error: 'Request body must be non-empty array' });
        }

        const batch = db.batch();
        const collectionRef = db.collection('Requests');
        dataArray.forEach(item => {
            const docRef = collectionRef.doc();
            batch.set(docRef, item);
        })
        await batch.commit();
        const snapshot = await db.collection('Requests').count().get();
        const count = snapshot.data().count;
        res.status(201).json({ message: 'Data saved!', count: count });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Internal Server Error' })
    }
});

app.post('/sendEmail', async (req, res) => {
    const { to, subject, text, html } = req.body;
    try {
        await transporter.sendMail({
            from: '"Registrar Sample Web"',
            to, subject, text, html
        });
        const snapshot = await db.collection('Requests').count().get();
        const count = snapshot.data().count;
        res.status(200).send({ message: 'Email Sent Successfully', count: count });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Error Sending Email', error });
    }
})



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
})