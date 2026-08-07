# Banca Pedro

App web de banca de lotería (jugadas, cobros, ROI, Numerólogo, etc).

## Publicar en GitHub Pages
1. Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `(root)` → Save.
2. Espera 1-2 minutos y entra a: `https://<tu-usuario>.github.io/<nombre-del-repo>/`

## Nota sobre main.py
`main.py` (el escalper de resultados oficiales) NO se sube aquí ni se ejecuta en GitHub Pages —
GitHub Pages solo sirve archivos estáticos (HTML/CSS/JS). `main.py` debe correr aparte, en un
servidor o computadora que se mantenga encendida (por ejemplo un VPS, Render, Railway, o tu propia
PC), con `firebase-key.json` junto a él (ese archivo NUNCA debe subirse a GitHub, es tu credencial
privada de Firebase Admin).
