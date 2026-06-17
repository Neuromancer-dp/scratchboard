const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = 3747;
const db = new Database(path.join(__dirname, 'bingus.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#b48246',
    context_doc TEXT DEFAULT '',
    instructions TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    pinned INTEGER DEFAULT 0,
    color TEXT DEFAULT '',
    project_id INTEGER,
    session_id TEXT,
    source TEXT DEFAULT 'session',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS quick_captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS user_profile (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    transcript TEXT DEFAULT '[]',
    project_id INTEGER,
    summary TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS journal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL DEFAULT '',
    bingus_thinks TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS global_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Add color column if it doesn't exist (migration)
try { db.exec("ALTER TABLE cards ADD COLUMN color TEXT DEFAULT ''"); } catch(e) {}

const profileDefaults = [
  ['username','dusk'],['theme','amber'],['model',''],
  ['avatar',''],['about_me',''],['wallpaper',''],
  ['ollama_url','http://localhost:11434'],['active_project',''],
  ['tinker_mode','false'],['context_strategy','tags']
];
const insProfile = db.prepare('INSERT OR IGNORE INTO user_profile (key,value) VALUES (?,?)');
for (const [k,v] of profileDefaults) insProfile.run(k,v);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req,file,cb) => {
      const dir = path.join(__dirname,'public','uploads');
      fs.mkdirSync(dir,{recursive:true});
      cb(null,dir);
    },
    filename: (req,file,cb) => cb(null,`${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
  }),
  limits:{fileSize:25*1024*1024}
});

app.use(express.json({limit:'25mb'}));
app.use(express.static(path.join(__dirname,'public')));

const getProfile = () => {
  const rows = db.prepare('SELECT key,value FROM user_profile').all();
  const p = {}; for (const r of rows) p[r.key] = r.value; return p;
};

// PROFILE
app.get('/api/profile',(req,res)=>res.json(getProfile()));
app.patch('/api/profile',(req,res)=>{
  const u = db.prepare('INSERT OR REPLACE INTO user_profile (key,value) VALUES (?,?)');
  for (const [k,v] of Object.entries(req.body)) u.run(k,String(v));
  res.json(getProfile());
});

// MODELS
app.get('/api/models',async(req,res)=>{
  try{
    const ollamaUrl=getProfile().ollama_url||'http://localhost:11434';
    const r=await fetch(`${ollamaUrl}/api/tags`);
    const data=await r.json();
    res.json((data.models||[]).map(m=>({name:m.name,size:m.size})));
  }catch(e){ res.json([]); }
});

// UPLOADS
app.post('/api/upload/avatar',upload.single('avatar'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'no file'});
  const url=`/uploads/${req.file.filename}`;
  db.prepare('INSERT OR REPLACE INTO user_profile (key,value) VALUES (?,?)').run('avatar',url);
  res.json({url});
});
app.post('/api/upload/wallpaper',upload.single('wallpaper'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'no file'});
  const url=`/uploads/${req.file.filename}`;
  db.prepare('INSERT OR REPLACE INTO user_profile (key,value) VALUES (?,?)').run('wallpaper',url);
  res.json({url});
});
app.post('/api/upload/project-context',upload.single('context'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'no file'});
  const content=fs.readFileSync(req.file.path,'utf8');
  fs.unlinkSync(req.file.path);
  res.json({content});
});
app.post('/api/upload/file',upload.single('file'),(req,res)=>{
  if(!req.file) return res.status(400).json({error:'no file'});
  const ext=path.extname(req.file.originalname).toLowerCase();
  const textExts=['.txt','.md','.js','.py','.json','.html','.css','.csv','.ts','.jsx','.tsx','.sh'];
  const imageExts=['.png','.jpg','.jpeg','.gif','.webp'];
  if(textExts.includes(ext)){
    const content=fs.readFileSync(req.file.path,'utf8');
    fs.unlinkSync(req.file.path);
    res.json({type:'text',content,name:req.file.originalname});
  } else if(imageExts.includes(ext)){
    const data=fs.readFileSync(req.file.path);
    const b64=data.toString('base64');
    fs.unlinkSync(req.file.path);
    res.json({type:'image',data:b64,mime:req.file.mimetype,name:req.file.originalname});
  } else {
    fs.unlinkSync(req.file.path);
    res.json({type:'unsupported',name:req.file.originalname});
  }
});

// EXPORT
app.get('/api/export',async(req,res)=>{
  try{
    const archiver=(await import('archiver')).default;
    res.setHeader('Content-Type','application/zip');
    res.setHeader('Content-Disposition','attachment; filename="bingus-hub-export.zip"');
    const archive=archiver('zip',{zlib:{level:9}});
    archive.pipe(res);
    const parseCard=c=>({...c,tags:JSON.parse(c.tags||'[]')});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM cards').all().map(parseCard),null,2),{name:'cards.json'});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM projects').all(),null,2),{name:'projects.json'});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM sessions').all().map(s=>({...s,transcript:JSON.parse(s.transcript||'[]')})),null,2),{name:'sessions.json'});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM journal').all(),null,2),{name:'journal.json'});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM memories').all(),null,2),{name:'memories.json'});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM global_context').all(),null,2),{name:'context.json'});
    archive.append(JSON.stringify(db.prepare('SELECT * FROM quick_captures').all(),null,2),{name:'captures.json'});
    archive.append(JSON.stringify({...getProfile(),exported_at:new Date().toISOString(),version:'1.0'},null,2),{name:'profile.json'});
    const uploadsDir=path.join(__dirname,'public','uploads');
    if(fs.existsSync(uploadsDir)) archive.directory(uploadsDir,'wallpapers');
    archive.finalize();
  }catch(e){res.status(500).json({error:'export failed'});}
});

// PROJECTS
app.get('/api/projects',(req,res)=>res.json(db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all()));
app.post('/api/projects',(req,res)=>{
  const {name,color,context_doc,instructions}=req.body;
  const r=db.prepare('INSERT INTO projects (name,color,context_doc,instructions) VALUES (?,?,?,?)').run(name,color||'#b48246',context_doc||'',instructions||'');
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(r.lastInsertRowid));
});
app.patch('/api/projects/:id',(req,res)=>{
  const p=db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if(!p) return res.status(404).json({error:'not found'});
  const {name,color,context_doc,instructions}=req.body;
  db.prepare('UPDATE projects SET name=?,color=?,context_doc=?,instructions=? WHERE id=?')
    .run(name??p.name,color??p.color,context_doc??p.context_doc,instructions??p.instructions,req.params.id);
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));
});
app.delete('/api/projects/:id',(req,res)=>{
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// CARDS
const parseCard = c => ({...c,tags:JSON.parse(c.tags||'[]')});
app.get('/api/cards',(req,res)=>{
  const pid=req.query.project_id;
  const cards=pid
    ?db.prepare('SELECT * FROM cards WHERE project_id=? ORDER BY pinned DESC,created_at DESC').all(pid)
    :db.prepare('SELECT * FROM cards ORDER BY pinned DESC,created_at DESC').all();
  res.json(cards.map(parseCard));
});
app.post('/api/cards',(req,res)=>{
  const {title,body,tags,pinned,session_id,project_id,source,color}=req.body;
  if(!title) return res.status(400).json({error:'title required'});
  const r=db.prepare('INSERT INTO cards (title,body,tags,pinned,session_id,project_id,source,color) VALUES (?,?,?,?,?,?,?,?)')
    .run(title,body||'',JSON.stringify(tags||[]),pinned?1:0,session_id||null,project_id||null,source||'session',color||'');
  res.json(parseCard(db.prepare('SELECT * FROM cards WHERE id=?').get(r.lastInsertRowid)));
});
app.patch('/api/cards/:id',(req,res)=>{
  const c=db.prepare('SELECT * FROM cards WHERE id=?').get(req.params.id);
  if(!c) return res.status(404).json({error:'not found'});
  const {pinned,title,body,tags,project_id,color}=req.body;
  db.prepare('UPDATE cards SET pinned=?,title=?,body=?,tags=?,project_id=?,color=? WHERE id=?')
    .run(pinned!==undefined?pinned?1:0:c.pinned,title??c.title,body??c.body,tags?JSON.stringify(tags):c.tags,project_id!==undefined?project_id:c.project_id,color??c.color,req.params.id);
  res.json(parseCard(db.prepare('SELECT * FROM cards WHERE id=?').get(req.params.id)));
});
app.delete('/api/cards/:id',(req,res)=>{
  db.prepare('DELETE FROM cards WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// CAPTURES
app.get('/api/captures',(req,res)=>res.json(db.prepare('SELECT * FROM quick_captures ORDER BY created_at DESC').all()));
app.post('/api/captures',(req,res)=>{
  const r=db.prepare('INSERT INTO quick_captures (text) VALUES (?)').run(req.body.text||'');
  res.json(db.prepare('SELECT * FROM quick_captures WHERE id=?').get(r.lastInsertRowid));
});
app.delete('/api/captures/:id',(req,res)=>{
  db.prepare('DELETE FROM quick_captures WHERE id=?').run(req.params.id);
  res.json({ok:true});
});
app.post('/api/captures/:id/promote',(req,res)=>{
  const cap=db.prepare('SELECT * FROM quick_captures WHERE id=?').get(req.params.id);
  if(!cap) return res.status(404).json({error:'not found'});
  const r=db.prepare('INSERT INTO cards (title,body,tags,source) VALUES (?,?,?,?)').run(cap.text.slice(0,60),cap.text,'[]','capture');
  db.prepare('DELETE FROM quick_captures WHERE id=?').run(req.params.id);
  res.json(parseCard(db.prepare('SELECT * FROM cards WHERE id=?').get(r.lastInsertRowid)));
});

// SESSIONS
app.get('/api/sessions',(req,res)=>{
  const pid=req.query.project_id;
  const q=pid?'SELECT id,summary,project_id,created_at FROM sessions WHERE project_id=? ORDER BY created_at DESC':'SELECT id,summary,project_id,created_at FROM sessions ORDER BY created_at DESC';
  res.json(pid?db.prepare(q).all(pid):db.prepare(q).all());
});
app.get('/api/sessions/active',(req,res)=>{
  const pid=req.query.project_id;
  const q=pid
    ?"SELECT * FROM sessions WHERE (summary IS NULL OR summary='') AND project_id=? ORDER BY created_at DESC LIMIT 1"
    :"SELECT * FROM sessions WHERE (summary IS NULL OR summary='') AND project_id IS NULL ORDER BY created_at DESC LIMIT 1";
  const s=pid?db.prepare(q).get(pid):db.prepare(q).get();
  if(!s) return res.status(404).json(null);
  try{s.transcript=JSON.parse(s.transcript);}catch{s.transcript=[];}
  res.json(s);
});
app.get('/api/sessions/latest',(req,res)=>{
  const s=db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').get();
  if(!s) return res.status(404).json(null);
  try{s.transcript=JSON.parse(s.transcript);}catch{s.transcript=[];}
  res.json(s);
});
app.get('/api/sessions/:id',(req,res)=>{
  const s=db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id);
  if(!s) return res.status(404).json(null);
  try{s.transcript=JSON.parse(s.transcript);}catch{s.transcript=[];}
  res.json(s);
});
app.delete('/api/sessions/:id',(req,res)=>{
  db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.post('/api/sessions',(req,res)=>{
  const {id,transcript,project_id,summary}=req.body;
  db.prepare('INSERT OR REPLACE INTO sessions (id,transcript,project_id,summary) VALUES (?,?,?,?)')
    .run(id,JSON.stringify(transcript||[]),project_id||null,summary||'');
  res.json({ok:true});
});

// JOURNAL
app.get('/api/journal',(req,res)=>res.json(db.prepare('SELECT * FROM journal ORDER BY created_at DESC').all()));
app.post('/api/journal',(req,res)=>{
  const r=db.prepare('INSERT INTO journal (content) VALUES (?)').run(req.body.content||'');
  res.json(db.prepare('SELECT * FROM journal WHERE id=?').get(r.lastInsertRowid));
});
app.patch('/api/journal/:id',(req,res)=>{
  const j=db.prepare('SELECT * FROM journal WHERE id=?').get(req.params.id);
  if(!j) return res.status(404).json({error:'not found'});
  const {content,bingus_thinks}=req.body;
  db.prepare("UPDATE journal SET content=?,bingus_thinks=?,updated_at=datetime('now') WHERE id=?")
    .run(content??j.content,bingus_thinks??j.bingus_thinks,req.params.id);
  res.json(db.prepare('SELECT * FROM journal WHERE id=?').get(req.params.id));
});
app.delete('/api/journal/:id',(req,res)=>{
  db.prepare('DELETE FROM journal WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// MEMORIES
app.get('/api/memories',(req,res)=>res.json(db.prepare('SELECT * FROM memories ORDER BY created_at DESC').all().map(m=>({...m,tags:JSON.parse(m.tags||'[]')}))));
app.post('/api/memories',(req,res)=>{
  const {title,content,source,tags}=req.body;
  const r=db.prepare('INSERT INTO memories (title,content,source,tags) VALUES (?,?,?,?)').run(title,content,source||'user',JSON.stringify(tags||[]));
  res.json(db.prepare('SELECT * FROM memories WHERE id=?').get(r.lastInsertRowid));
});
app.delete('/api/memories/:id',(req,res)=>{
  db.prepare('DELETE FROM memories WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// GLOBAL CONTEXT
app.get('/api/context',(req,res)=>res.json(db.prepare('SELECT * FROM global_context ORDER BY created_at DESC').all()));
app.post('/api/context',(req,res)=>{
  const r=db.prepare('INSERT INTO global_context (title,content) VALUES (?,?)').run(req.body.title,req.body.content);
  res.json(db.prepare('SELECT * FROM global_context WHERE id=?').get(r.lastInsertRowid));
});
app.patch('/api/context/:id',(req,res)=>{
  db.prepare('UPDATE global_context SET title=?,content=? WHERE id=?').run(req.body.title,req.body.content,req.params.id);
  res.json(db.prepare('SELECT * FROM global_context WHERE id=?').get(req.params.id));
});
app.delete('/api/context/:id',(req,res)=>{
  db.prepare('DELETE FROM global_context WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.post('/api/shutdown',(req,res)=>{
  res.json({ok:true});
  setTimeout(()=>process.exit(0),500);
});

const server=app.listen(PORT,()=>console.log(`bingus-hub release 1.3 running at http://localhost:${PORT}`));

// Graceful shutdown on SIGINT/SIGTERM - gives frontend 2s to save
function gracefulShutdown(signal){
  console.log('\n'+signal+' received — shutting down gracefully...');
  server.close(()=>{
    console.log('server closed');
    process.exit(0);
  });
  setTimeout(()=>process.exit(0),3000);
}
process.on('SIGINT',()=>gracefulShutdown('SIGINT'));
process.on('SIGTERM',()=>gracefulShutdown('SIGTERM'));
