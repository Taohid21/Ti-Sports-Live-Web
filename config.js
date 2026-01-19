import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = { 
    apiKey: "AIzaSyAb8YsPMOY53GxiycCL6G0MPZdgWe3nnyY", 
    authDomain: "movie-92659.firebaseapp.com", 
    projectId: "movie-92659", 
    storageBucket: "movie-92659.appspot.com", 
    messagingSenderId: "1090734362509", 
    appId: "1:1090734362509:web:86be5583f6e8fcfdfa77c4" 
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const YOUTUBE_API_KEY = "AIzaSyBFxF8kRg7VdxYKsQdFO-WQkdxS9vF-B6M";