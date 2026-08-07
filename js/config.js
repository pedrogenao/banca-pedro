/* ========================================================================
   CONFIG.JS
   Configuración e inicialización de Firebase (App, Auth, Firestore).
   ======================================================================== */

/* ======================================================================
   CONFIGURACIÓN DE FIREBASE — mismo proyecto que tu app de Flutter
   (tomado de tu firebase_options.dart, plataforma web).
   ====================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyAtbHPk-Vsi2RssajHojOIXbhbp_k3sjOU",
  appId: "1:876213579101:web:802c1ab4f5962c756dccb4",
  messagingSenderId: "876213579101",
  projectId: "loterias-rd-a40a7",
  authDomain: "loterias-rd-a40a7.firebaseapp.com",
  storageBucket: "loterias-rd-a40a7.firebasestorage.app",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage(); // usado por el Chat para subir notas de voz

