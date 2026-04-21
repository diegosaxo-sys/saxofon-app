const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const API = SUPABASE_URL + '/rest/v1/partituras';

function headers(extra){
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    ...extra
  };
}

async function sb(method, url, body){
  const opts = { method, headers: headers(method==='POST'?{'Prefer':'return=representation'}:method==='GET'?{'Accept':'application/json'}:{}) };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if(!r.ok){ const t=await r.text(); throw new Error(t); }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// GET todas
app.get('/api/partituras', async (req, res) => {
  try{
    const data = await sb('GET', API + '?select=id,titulo,compas,instrument,creada_en,compases&order=creada_en.desc');
    res.json((data||[]).map(p=>({
      id:p.id, titulo:p.titulo, compas:p.compas,
      instrument:p.instrument, creadaEn:p.creada_en,
      numCompases: p.compases ? p.compases.length : 0
    })));
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// GET una
app.get('/api/partituras/:id', async (req, res) => {
  try{
    const data = await sb('GET', API + '?id=eq.'+req.params.id+'&select=*');
    if(!data||!data.length) return res.status(404).json({error:'No encontrada'});
    const p=data[0];
    res.json({id:p.id,titulo:p.titulo,compas:p.compas,instrument:p.instrument,compases:p.compases,creadaEn:p.creada_en});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// POST nueva
app.post('/api/partituras', async (req, res) => {
  try{
    const id = 'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
    const {titulo,compas,instrument,compases} = req.body;
    await sb('POST', API, {id,titulo,compas,instrument,compases});
    res.json({id});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// PUT actualizar
app.put('/api/partituras/:id', async (req, res) => {
  try{
    const {titulo,compas,instrument,compases} = req.body;
    await sb('PATCH', API+'?id=eq.'+req.params.id, {titulo,compas,instrument,compases,actualizada_en:new Date().toISOString()});
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// DELETE
app.delete('/api/partituras/:id', async (req, res) => {
  try{
    await sb('DELETE', API+'?id=eq.'+req.params.id);
    res.json({ok:true});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('SaxoApp en puerto '+PORT));
