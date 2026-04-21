const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partituras (
      id TEXT PRIMARY KEY,
      titulo TEXT,
      compas TEXT,
      instrument TEXT,
      compases JSONB,
      creada_en TIMESTAMPTZ DEFAULT NOW(),
      actualizada_en TIMESTAMPTZ
    )
  `);
  console.log('Base de datos lista');
}

app.get('/api/partituras', async (req, res) => {
  try{
    const r = await pool.query(
      'SELECT id, titulo, compas, instrument, creada_en, jsonb_array_length(compases) as num_compases FROM partituras ORDER BY creada_en DESC'
    );
    res.json(r.rows.map(p=>({
      id: p.id, titulo: p.titulo, compas: p.compas,
      instrument: p.instrument, creadaEn: p.creada_en,
      numCompases: parseInt(p.num_compases)||0
    })));
  }catch(e){ console.error(e); res.status(500).json({error:'Error'}); }
});

app.get('/api/partituras/:id', async (req, res) => {
  try{
    const r = await pool.query('SELECT * FROM partituras WHERE id=$1', [req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'No encontrada'});
    const p = r.rows[0];
    res.json({ id:p.id, titulo:p.titulo, compas:p.compas,
      instrument:p.instrument, compases:p.compases, creadaEn:p.creada_en });
  }catch(e){ console.error(e); res.status(500).json({error:'Error'}); }
});

app.post('/api/partituras', async (req, res) => {
  try{
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const { titulo, compas, instrument, compases } = req.body;
    await pool.query(
      'INSERT INTO partituras (id, titulo, compas, instrument, compases) VALUES ($1,$2,$3,$4,$5)',
      [id, titulo, compas, instrument, JSON.stringify(compases)]
    );
    res.json({id});
  }catch(e){ console.error(e); res.status(500).json({error:'Error'}); }
});

app.put('/api/partituras/:id', async (req, res) => {
  try{
    const { titulo, compas, instrument, compases } = req.body;
    await pool.query(
      'UPDATE partituras SET titulo=$1, compas=$2, instrument=$3, compases=$4, actualizada_en=NOW() WHERE id=$5',
      [titulo, compas, instrument, JSON.stringify(compases), req.params.id]
    );
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'Error'}); }
});

app.delete('/api/partituras/:id', async (req, res) => {
  try{
    await pool.query('DELETE FROM partituras WHERE id=$1', [req.params.id]);
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:'Error'}); }
});

const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`SaxoApp en puerto ${PORT}`));
}).catch(e => { console.error('Error iniciando DB:', e); process.exit(1); });
