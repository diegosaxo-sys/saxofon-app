const express = require('express');
const path = require('path');
const app = express();
app.use(express.json({ limit: '10mb' }));

// HTML nunca cacheado, resto de archivos cacheados 1 día
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if(filePath.endsWith('.html')){
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

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
    const data = await sb('GET', API + '?select=id,titulo,compas,instrument,creada_en,compases,audio_url,bloque,orden,xml_content,svg_url&order=orden.asc,creada_en.desc');
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
      svgUrl: p.svg_url||'',
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

    // Primero obtener los valores actuales para no sobreescribir XML/SVG con vacío
    const current = await sb('GET', API + '?id=eq.'+req.params.id+'&select=xml_content,svg_url');
    const currentXml = current&&current[0] ? current[0].xml_content||'' : '';
    const currentSvg = current&&current[0] ? current[0].svg_url||'' : '';

    // Solo actualizar XML/SVG si vienen con contenido nuevo — nunca borrar con vacío
    const finalXml = xmlContent ? xmlContent : currentXml;
    const finalSvg = svgUrl ? svgUrl : currentSvg;

    await sb('PATCH', API+'?id=eq.'+req.params.id, {
      titulo, compas, instrument, compases,
      audio_url: audioUrl||'',
      bloque: bloque||'General',
      orden: orden||0,
      xml_content: finalXml,
      svg_url: finalSvg,
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

// PROXY audio Google Drive
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

// PROXY imágenes PNG/SVG Google Drive
app.get('/api/image/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    let driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    let response = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'image/svg+xml,image/png,image/*,*/*'
      },
      redirect: 'follow'
    });
    const contentType = response.headers.get('content-type') || '';
    if(contentType.includes('text/html')){
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
    const finalContentType = response.headers.get('content-type') || 'image/png';
    if(finalContentType.includes('text/html')){
      return res.status(403).json({ error: 'Drive requiere autenticación. Asegúrate de que el archivo es público.' });
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
