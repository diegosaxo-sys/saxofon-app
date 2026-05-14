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
    const data = await sb('GET', API + '?select=id,titulo,compas,instrument,creada_en,compases,audio_url,bloque,orden,xml_content&order=orden.asc,creada_en.desc');
    res.json((data||[]).map(p=>({
      id: p.id,
      titulo: p.titulo,
      compas: p.compas,
      instrument: p.instrument,
      creadaEn: p.creada_en,
      audioUrl: p.audio_url||'',
      bloque: p.bloque||'General',
      orden: p.orden||0,
      hasXml: !!p.xml_content,
      numCompases: p.compases ? p.compases.length : 0
    })));
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// GET una — devuelve todo incluyendo xml_content
app.get('/api/partituras/:id', async (req, res) => {
  try{
    const data = await sb('GET', API + '?id=eq.'+req.params.id+'&select=*');
    if(!data||!data.length) return res.status(404).json({error:'No encontrada'});
    const p=data[0];
    res.json({
      id: p.id,
      titulo: p.titulo,
      compas: p.compas,
      instrument: p.instrument,
      compases: p.compases,
      creadaEn: p.creada_en,
      audioUrl: p.audio_url||'',
      bloque: p.bloque||'General',
      orden: p.orden||0,
      xmlContent: p.xml_content||'',
      svgUrl: p.svg_url||''
    });
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// POST nueva
app.post('/api/partituras', async (req, res) => {
  try{
    const id = 'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
    const {titulo,compas,instrument,compases,audioUrl,bloque,orden,xmlContent,svgUrl} = req.body;
    await sb('POST', API, {
      id, titulo, compas, instrument, compases,
      audio_url: audioUrl||'',
      bloque: bloque||'General',
      orden: orden||0,
      xml_content: xmlContent||'',
      svg_url: svgUrl||''
    });
    res.json({id});
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});

// PUT actualizar
app.put('/api/partituras/:id', async (req, res) => {
  try{
    const {titulo,compas,instrument,compases,audioUrl,bloque,orden,xmlContent,svgUrl} = req.body;
    await sb('PATCH', API+'?id=eq.'+req.params.id, {
      titulo, compas, instrument, compases,
      audio_url: audioUrl||'',
      bloque: bloque||'General',
      orden: orden||0,
      xml_content: xmlContent||'',
      svg_url: svgUrl||'',
      actualizada_en: new Date().toISOString()
    });
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

// PROXY para backingtracks de Google Drive
app.get('/api/audio/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const response = await fetch(driveUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow'
    });
    if (!response.ok) {
      return res.status(502).json({ error: 'No se pudo obtener el audio de Drive' });
    }
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('Error proxy audio:', e);
    res.status(500).json({ error: e.message });
  }
});

// PROXY para imágenes SVG/PNG de Google Drive
// Drive a veces redirige a una página de confirmación — manejamos ambos casos
app.get('/api/image/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;

    // Intentar primero con export=download (descarga directa)
    let driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    let response = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/svg+xml,image/png,image/*,*/*'
      },
      redirect: 'follow'
    });

    // Si Drive devuelve HTML (página de confirmación) en vez de imagen,
    // intentar con la URL de thumbnail/export directa
    const contentType = response.headers.get('content-type') || '';
    if(contentType.includes('text/html')){
      // Intentar con export=view
      driveUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
      response = await fetch(driveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/svg+xml,image/png,image/*,*/*'
        },
        redirect: 'follow'
      });
    }

    if (!response.ok) {
      return res.status(502).json({ error: 'No se pudo obtener la imagen de Drive' });
    }

    const finalContentType = response.headers.get('content-type') || 'image/svg+xml';

    // Si sigue siendo HTML, Drive no permite el acceso directo
    if(finalContentType.includes('text/html')){
      return res.status(403).json({ error: 'Drive requiere autenticación. Asegúrate de que el archivo es público (cualquiera con el enlace puede ver).' });
    }

    res.setHeader('Content-Type', finalContentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error('Error proxy imagen:', e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('SaxoApp en puerto '+PORT));
