const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const partituras = {};

app.get('/api/partituras', (req, res) => {
  const lista = Object.entries(partituras).map(([id, p]) => ({
    id, titulo: p.titulo, compas: p.compas,
    creadaEn: p.creadaEn, numCompases: p.compases ? p.compases.length : 0
  }));
  lista.sort((a, b) => new Date(b.creadaEn) - new Date(a.creadaEn));
  res.json(lista);
});

app.get('/api/partituras/:id', (req, res) => {
  const p = partituras[req.params.id];
  if (!p) return res.status(404).json({ error: 'No encontrada' });
  res.json(p);
});

app.post('/api/partituras', (req, res) => {
  const id = 'p_' + Date.now();
  partituras[id] = { ...req.body, id, creadaEn: new Date().toISOString() };
  res.json({ id });
});

app.put('/api/partituras/:id', (req, res) => {
  const id = req.params.id;
  if (!partituras[id]) return res.status(404).json({ error: 'No encontrada' });
  partituras[id] = { ...req.body, id, creadaEn: partituras[id].creadaEn };
  res.json({ ok: true });
});

app.delete('/api/partituras/:id', (req, res) => {
  delete partituras[req.params.id];
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Saxofón App corriendo en puerto ${PORT}`));
