// ✅ THIS IS THE FINAL, CORRECTED CODE. IT USES ip-api.com FOR ACCURATE LOCATION LOOKUPS.

import express from "express";
import admin from "firebase-admin";
import dotenv from "dotenv";
import cors from "cors";
import { readFileSync } from 'fs';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import axios from 'axios';
import FormData from 'form-data';
import path from 'path';
import nodemailer from 'nodemailer';

dotenv.config();

// --- FIREBASE ADMIN SETUP ---
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});
const db = admin.firestore();
const productsCollection = db.collection('products');
const subscribersCollection = db.collection('subscribers'); // Added for clarity

// --- CLOUDINARY, MULTER, AND NODEMAILER SETUP ---
cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
const imageStorage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'hyjain-products', allowed_formats: ['jpeg', 'png', 'jpg', 'webp'] } });
const imageUpload = multer({ storage: imageStorage });
const memoryStorage = multer.memoryStorage();
const fileUpload = multer({ storage: memoryStorage });
const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.NODEMAILER_EMAIL, pass: process.env.NODEMAILER_APP_PASSWORD, }, });
console.log('Nodemailer configured for:', process.env.NODEMAILER_EMAIL);

// --- EXPRESS APP SETUP ---
const app = express();
app.use(cors());
app.use(express.json());
app.set('trust proxy', true);

// =================================================================
// --- API ROUTES ---
// =================================================================

// --- IMAGE & FILE UPLOAD ROUTES ---
app.post('/api/upload-image', imageUpload.single('image'), (req, res) => { try { if (!req.file) { return res.status(400).json({ error: 'No image file uploaded.' }); } res.status(200).json({ imageUrl: req.file.path }); } catch (error) { console.error("Cloudinary Image Upload Error:", error); res.status(500).json({ error: 'Image upload failed: ' + error.message }); } });
app.post('/api/upload-file', fileUpload.single('file'), async (req, res) => { if (!req.file) { return res.status(400).json({ error: 'No file was uploaded.' }); } try { const formData = new FormData(); formData.append('UPLOADCARE_PUB_KEY', '8d5189298f8465f7079f'); formData.append('UPLOADCARE_STORE', 'auto'); formData.append('file', req.file.buffer, { filename: req.file.originalname }); const response = await axios.post('https://upload.uploadcare.com/base/', formData, { headers: formData.getHeaders() }); if (response.data && response.data.file) { res.status(200).json({ fileUUID: response.data.file }); } else { throw new Error('Uploadcare response did not contain a file UUID.'); } } catch (error) { const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message; console.error("Uploadcare API Error:", errorMessage); res.status(500).json({ error: 'File upload to Uploadcare failed.' }); } });


// --- SIGNUP NOTIFICATION EMAIL ROUTE ---
app.post("/api/notify-signup", async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required." });

        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: true, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (IST)';
        
        let ip = req.ip;
        if (ip === '::1' || ip === '127.0.0.1') {
            try { const { data } = await axios.get('https://api.ipify.org?format=json'); ip = data.ip; } catch (e) { console.error("Could not fetch public IP."); }
        }

        let locationInfo = 'Location not available';
        try { const { data } = await axios.get(`http://ip-api.com/json/${ip}`); if (data.status === 'success' && data.city && data.regionName) { locationInfo = `${data.city}, ${data.regionName}`; } } catch (apiError) { console.error("ip-api.com lookup failed:", apiError.message); }
        
        const mailOptions = { from: `"Hyjain" <${process.env.NODEMAILER_EMAIL}>`, to: email, subject: "Welcome to Hyjain! ✔", html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;"><h2>Welcome to Hyjain!</h2><p>Hello <b>${name || 'there'}</b>,</p><p>Your account was successfully created.</p><hr style="border:0; border-top:1px solid #eee;"><p style="color:#555; font-size:0.9em;"><strong>Time:</strong> ${timestamp}<br><strong>Approx. Location:</strong> ${locationInfo} (from IP: ${ip})</p><hr style="border:0; border-top:1px solid #eee;"><br><p>Best regards,</p><p><b>The Hyjain Team</b></p></div>`, };
        
        await transporter.sendMail(mailOptions);
        console.log(`Signup notification sent to: ${email} from IP: ${ip}`);
        res.status(200).json({ message: "Signup notification email sent." });
    } catch (error) { console.error("Nodemailer Error sending signup email:", error); res.status(500).json({ error: "Failed to send email." }); }
});

// --- LOGIN NOTIFICATION EMAIL ROUTE ---
app.post("/api/notify-login", async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required." });

        const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour12: true, year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (IST)';
        
        let ip = req.ip;
        if (ip === '::1' || ip === '127.0.0.1') {
            try { const { data } = await axios.get('https://api.ipify.org?format=json'); ip = data.ip; } catch (e) { console.error("Could not fetch public IP."); }
        }
        
        let locationInfo = 'Location not available';
        try { const { data } = await axios.get(`http://ip-api.com/json/${ip}`); if (data.status === 'success' && data.city && data.regionName) { locationInfo = `${data.city}, ${data.regionName}`; } } catch (apiError) { console.error("ip-api.com lookup failed:", apiError.message); }
        
        const mailOptions = { from: `"Hyjain" <${process.env.NODEMAILER_EMAIL}>`, to: email, subject: "Security Alert: New Login to Your Hyjain Account", html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;"><h2>Successful Login to Your Account</h2><p>Hello <b>${name || 'there'}</b>,</p><p>We're just letting you know that there has been a successful login to your Hyjain account.</p><div style="background-color:#f7f7f7; padding:15px; border-radius:5px; margin:20px 0;"><h4 style="margin-top:0;">Login Details:</h4><p style="margin:5px 0;"><strong>Time:</strong> ${timestamp}</p><p style="margin:5px 0;"><strong>Approx. Location:</strong> ${locationInfo} (from IP: ${ip})</p></div><p>If you do not recognize this activity, please change your password immediately.</p><br><p>Best regards,</p><p><b>The Hyjain Team</b></p></div>`, };

        await transporter.sendMail(mailOptions);
        console.log(`Login notification sent to: ${email} from IP: ${ip}`);
        res.status(200).json({ message: "Login notification email sent." });
    } catch (error) { console.error("Nodemailer Error sending login email:", error); res.status(500).json({ error: "Failed to send email." }); }
});

// ✅ --- NEW: ENQUIRY NOTIFICATION ROUTE ---
app.post("/api/notify-enquiry", async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required." });

        const mailOptions = {
            from: `"Hyjain" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: "We've Received Your Enquiry | Hyjain",
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #2c3e50;">Thank You for Reaching Out!</h2>
                <p>Hello <b>${name || 'there'}</b>,</p>
                <p>This email is to confirm that we have successfully received your enquiry. Our team is now reviewing the details you provided.</p>
                <p>We appreciate your interest and will get back to you as soon as possible with a response.</p>
                <br>
                <p>Best regards,</p>
                <p><b>The Hyjain Team</b></p>
              </div>`,
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`Enquiry notification sent to: ${email}`);
        res.status(200).json({ message: "Enquiry notification email sent." });
    } catch (error) {
        console.error("Nodemailer Error sending enquiry email:", error);
        res.status(500).json({ error: "Failed to send email." });
    }
});

// ✅ --- NEW: FEEDBACK NOTIFICATION ROUTE ---
app.post("/api/notify-feedback", async (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required." });

        const mailOptions = {
            from: `"Hyjain" <${process.env.NODEMAILER_EMAIL}>`,
            to: email,
            subject: "Thank You for Your Feedback! | Hyjain",
            html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #2c3e50;">We Appreciate You!</h2>
                <p>Hello <b>${name || 'there'}</b>,</p>
                <p>Thank you so much for taking the time to send us your valuable feedback.</p>
                <p>Your insights help us improve and continue to provide the best possible experience. We've taken note of your comments and will use them to grow.</p>
                <br>
                <p>Best regards,</p>
                <p><b>The Hyjain Team</b></p>
              </div>`,
        };
        
        await transporter.sendMail(mailOptions);
        console.log(`Feedback notification sent to: ${email}`);
        res.status(200).json({ message: "Feedback notification email sent." });
    } catch (error) {
        console.error("Nodemailer Error sending feedback email:", error);
        res.status(500).json({ error: "Failed to send email." });
    }
});


// --- SUBSCRIBER NOTIFICATION ROUTE ---
app.post("/api/subscribe", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) { return res.status(400).json({ error: "Email is required." }); }
        await subscribersCollection.add({ email: email, subscribedAt: new Date() });
        const mailOptions = { from: `"Hyjain" <${process.env.NODEMAILER_EMAIL}>`, to: email, subject: "✨ Welcome to the Hyjain Family!", html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;"><h2 style="color: #2c3e50; text-align: center;">Welcome to the Hyjain Family! 👋</h2><p style="font-size: 16px; color: #34495e;">Hello there,</p><p style="font-size: 16px; color: #34495e;">Thank you for connecting with us and subscribing to our newsletter! We're so excited to have you with us.</p><p style="font-size: 16px; color: #34495e;">You can look forward to receiving updates on our latest products, exclusive offers, and news from the Hyjain team directly in your inbox.</p><br><p style="font-size: 16px; color: #34495e;">Stay tuned!</p><p style="font-size: 16px; color: #34495e;">Best regards,<br><b>The Hyjain Team</b></p></div>`, };
        await transporter.sendMail(mailOptions);
        console.log(`Subscription confirmation sent to: ${email}`);
        res.status(200).json({ message: "Subscription successful!" });
    } catch (error) { console.error("Subscription Error:", error); res.status(200).json({ message: "Subscription successful! Email might be delayed." }); }
});

// --- Other existing routes ---
app.get("/api/products", async (req, res) => { try { const snapshot = await productsCollection.get(); const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); res.status(200).json(products); } catch (err) { res.status(500).json({ error: "Failed to fetch products: " + err.message }); } });
app.get("/api/users", async (req, res) => { try { const userRecords = await admin.auth().listUsers(); const users = userRecords.users.map(user => ({ id: user.uid, email: user.email, name: user.displayName || user.email.split('@')[0], })); res.status(200).json(users); } catch (err) { res.status(500).json({ error: "Failed to fetch users: " + err.message }); } });
app.post("/api/products", async (req, res) => { try { const newProduct = req.body; const docRef = await productsCollection.add(newProduct); res.status(201).json({ id: docRef.id, ...newProduct }); } catch (err) { res.status(500).json({ error: "Failed to add product: " + err.message }); } });
app.put("/api/products/:id", async (req, res) => { try { const { id } = req.params; const updatedData = req.body; await db.collection('products').doc(id).update(updatedData); res.status(200).json({ id, ...updatedData }); } catch (err) { res.status(500).json({ error: "Failed to update product: " + err.message }); } });
app.delete("/api/products/:id", async (req, res) => { try { const { id } = req.params; await db.collection('products').doc(id).delete(); res.status(200).json({ message: `Product with id ${id} deleted successfully.` }); } catch (err) { res.status(500).json({ error: "Failed to delete product: " + err.message }); } });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));