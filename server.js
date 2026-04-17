const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Persistencia en archivo JSON local
const DB_FILE = path.join(__dirname, 'data', 'partituras.json');

function loadDB() {
  try {
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch(e) {
    console.error('Error cargando DB:', e);
    return {};
  }
}

function saveDB(data) {
  try {
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch(e) {
    console.error('Error guardando DB:', e);
  }
}

// GET all
app.get('/api/partituras', (req, res) => {
  const db = loadDB();
  const lista = Object.values(db).map(p => ({
    id: p.id,
    titulo: p.titulo,
    compas: p.compas,
    instrument: p.instrument,
    creadaEn: p.creadaEn,
    numCompases: p.compases ? p.compases.length : 0
  }));
  lista.sort((a, b) => new Date(b.creadaEn) - new Date(a.creadaEn));
  res.json(lista);
});

// GET one
app.get('/api/partituras/:id', (req, res) => {
  const db = loadDB();
  const p = db[req.params.id];
  if (!p) return res.status(404).json({ error: 'No encontrada' });
  res.json(p);
});

// POST create
app.post('/api/partituras', (req, res) => {
  const db = loadDB();
  const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const partitura = { ...req.body, id, creadaEn: new Date().toISOString() };
  db[id] = partitura;
  saveDB(db);
  res.json({ id });
});

// PUT update
app.put('/api/partituras/:id', (req, res) => {
  const db = loadDB();
  const id = req.params.id;
  if (!db[id]) return res.status(404).json({ error: 'No encontrada' });
  db[id] = { ...req.body, id, creadaEn: db[id].creadaEn, actualizadaEn: new Date().toISOString() };
  saveDB(db);
  res.json({ ok: true });
});

// DELETE
app.delete('/api/partituras/:id', (req, res) => {
  const db = loadDB();
  if (!db[req.params.id]) return res.status(404).json({ error: 'No encontrada' });
  delete db[req.params.id];
  saveDB(db);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`SaxoApp corriendo en puerto ${PORT}`));
