const express = require('express');
const path = require('path');
require('dotenv').config();

const DEFAULT_SUPABASE_URL = 'https://vpejayaeznydqztulmgh.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uRnRWC9Ut3TK0Z6fJri-XA_GNZa0FpU';

const app = express();
app.use(express.json({ limit: '45mb' }));
app.use((req,res,next)=>{
  const allowed=['/','/index.html','/bodylab-upgrade.js','/bodylab-cloud.js','/pdf-lib.min.js','/api/health','/api/config'];
  if(req.method==='GET' && !allowed.includes(decodeURIComponent(req.path))) return res.status(404).end();
  next();
});
app.use(express.static(__dirname, { etag:false, maxAge:0, dotfiles:'deny' }));

function extractText(data){
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string') return content;
  if(Array.isArray(content)) return content.filter(part=>part.type==='text').map(part=>part.text).join('');
  return '';
}

app.get('/api/health',(req,res)=>{
  const supabaseUrl=String(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).trim();
  const supabaseKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();
  res.json({ok:true,version:'bodylab-cloud-20261003-2',model:process.env.OPENROUTER_MODEL||'google/gemini-2.5-flash',imageModel:process.env.OPENROUTER_IMAGE_MODEL||'google/gemini-3.1-flash-image',aiConfigured:Boolean(process.env.OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY.includes('COLE_')),supabaseConfigured:Boolean(supabaseUrl&&supabaseKey)});
});

app.get('/api/config',(req,res)=>{
  const supabaseUrl=String(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).trim();
  const supabaseKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();
  res.set('Cache-Control','no-store');
  res.json({supabaseUrl,supabaseKey,supabaseConfigured:Boolean(supabaseUrl&&supabaseKey&&!supabaseKey.includes('COLE_')),version:'bodylab-cloud-20261003-2'});
});

app.post('/api/analyze', async (req,res)=>{
  try{
    if(!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY.includes('COLE_')) return res.status(500).json({error:'Configure OPENROUTER_API_KEY no arquivo .env'});
    const {student,monthA,monthB,images}=req.body||{};
    const views=['Frente','Lateral','Costas'];
    if(!images?.A || !images?.B || views.some(v=>!images.A[v]||!images.B[v])) return res.status(400).json({error:'As 6 fotos são obrigatórias.'});

    const prompt=`Você é o BODY COMPARE, módulo de acompanhamento visual para Personal Trainers.
Compare o MESMO aluno (${student||'aluno'}) entre o período A (${monthA||''}) e o período B (${monthB||''}). As fotos serão enviadas em pares identificados: A Frente, B Frente, A Lateral, B Lateral, A Costas, B Costas.

OBJETIVO PRINCIPAL
Faça uma leitura de EVOLUÇÃO FÍSICA APARENTE, e não uma crítica fotográfica. Em cada vista, procure diferenças visualmente sustentáveis em contorno, volume aparente, definição aparente, silhueta e proporções. Observe, quando visíveis: deltoides/ombros, braços, peitoral, dorsais, cintura, abdômen, glúteos, coxas e panturrilhas.

COMO ESCREVER
- Compare sempre a mesma região A versus B.
- Quando houver evidência, seja direto: "maior volume aparente", "menor volume aparente", "maior definição aparente", "cintura visualmente mais estreita/larga", etc.
- Mudanças podem representar evolução, regressão ou estabilidade visual.
- Não abandone toda a análise por diferenças de pose, luz, distância, roupa ou câmera. Use esses fatores apenas para baixar a confiança do achado afetado.
- Para cada vista, entregue pelo menos 2 comparações regionais úteis quando as regiões estiverem visíveis. Se uma comparação realmente não for sustentável, classifique-a como inconclusiva em vez de inventar.
- Não invente kg, percentual de gordura, centímetros, diagnóstico, lesão ou composição corporal exata a partir das fotos.

MARCAÇÕES SINCRONIZADAS
Cada achado deve conter uma caixa aproximada da MESMA região corporal nas fotos A e B. Use percentuais 0-100 relativos à área da foto: x e y são o centro da região; w e h são largura e altura da elipse. As caixas precisam apontar para a região descrita, não para o corpo inteiro. A marcação e o texto devem ter o mesmo número.

Responda em português do Brasil e somente JSON neste formato: {"resumo":"texto","alerta_tecnico":"texto","achados":[{"numero":1,"vista":"Frente","regiao":"cintura","mudanca":"texto","direcao":"evolucao","confianca":"média","boxA":{"x":50,"y":50,"w":18,"h":12},"boxB":{"x":50,"y":50,"w":18,"h":12}}],"prioridades":["texto"]}.`;

    const content=[{type:'text',text:prompt}];
    for(const v of views){
      content.push({type:'text',text:`PERÍODO A • ${v}`});
      content.push({type:'image_url',image_url:{url:images.A[v],detail:'high'}});
      content.push({type:'text',text:`PERÍODO B • ${v}`});
      content.push({type:'image_url',image_url:{url:images.B[v],detail:'high'}});
    }

    const box={type:'object',additionalProperties:false,properties:{x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'}},required:['x','y','w','h']};
    const schema={type:'object',additionalProperties:false,properties:{
      resumo:{type:'string'},alerta_tecnico:{type:'string'},
      achados:{type:'array',items:{type:'object',additionalProperties:false,properties:{
        numero:{type:'integer'},vista:{type:'string',enum:['Frente','Lateral','Costas']},regiao:{type:'string'},mudanca:{type:'string'},
        direcao:{type:'string',enum:['evolucao','regressao','estavel','inconclusivo']},confianca:{type:'string',enum:['baixa','média','alta']},
        boxA:box,boxB:box
      },required:['numero','vista','regiao','mudanca','direcao','confianca','boxA','boxB']}},
      prioridades:{type:'array',items:{type:'string'}}
    },required:['resumo','alerta_tecnico','achados','prioridades']};

    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    let api;
    try {api=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{
      'Authorization':`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json',
      'HTTP-Referer':'http://localhost:8080','X-OpenRouter-Title':'Body Lab'
    },body:JSON.stringify({
      model:process.env.OPENROUTER_MODEL||'google/gemini-2.5-flash',
      messages:[{role:'user',content}],
      response_format:{type:'json_object'},max_tokens:2400
    })});}finally{clearTimeout(timeout)}
    const data=await api.json();
    if(!api.ok) {
      console.error('OpenRouter status:',api.status,data?.error?.message||'sem detalhes');
      return res.status(api.status).json({error:`OpenRouter (${api.status}): ${data?.error?.message||'Verifique modelo, chave e saldo.'}`});
    }
    const text=extractText(data); if(!text) return res.status(502).json({error:'A IA não retornou texto estruturado.'});
    let analysis; try{analysis=JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g,'').trim())}catch{return res.status(502).json({error:'A IA não retornou JSON válido. Tente novamente.'})}
    if(!Array.isArray(analysis.achados)) return res.status(502).json({error:'A IA não retornou os achados esperados. Tente novamente.'});
    res.json({analysis,model:data.model||process.env.OPENROUTER_MODEL||'google/gemini-2.5-flash'});
  }catch(err){console.error(err);res.status(err.name==='AbortError'?504:500).json({error:err.name==='AbortError'?'A análise demorou demais. Tente novamente com fotos menores.':err.message||'Erro interno'});}
});

app.post('/api/future-body', async (req,res)=>{
  try{
    const key=process.env.OPENROUTER_API_KEY;
    if(!key || key.includes('COLE_')) return res.status(500).json({error:'Configure OPENROUTER_API_KEY no arquivo .env'});
    const {student,prompt,duration,images}=req.body||{};
    const views=['Frente','Lado','Costas'];
    if(!String(prompt||'').trim()) return res.status(400).json({error:'Escreva a transformação física que deseja projetar.'});
    const missing=views.filter(view=>!images?.[view]);
    if(missing.length) return res.status(400).json({error:`Envie as três fotos. Faltam: ${missing.join(', ')}.`});
    for(const view of views){
      if(typeof images[view]!=='string' || !/^data:image\/(jpeg|png|webp);base64,/.test(images[view]))
        return res.status(400).json({error:`A foto de ${view.toLowerCase()} precisa estar em JPG, PNG ou WebP.`});
      if(images[view].length>8_000_000) return res.status(413).json({error:`A foto de ${view.toLowerCase()} está muito grande. Reenvie uma imagem menor.`});
    }
    const model=process.env.OPENROUTER_IMAGE_MODEL||'google/gemini-3.1-flash-image';
    const cleanStudent=String(student||'aluno').slice(0,80);
    const cleanPrompt=String(prompt).trim().slice(0,1800);
    const results=await Promise.all(views.map(async view=>{
      const angleRules={
        Frente:'vista frontal de corpo inteiro, manter enquadramento frontal e posição dos braços e pernas da foto de referência',
        Lado:'vista lateral de corpo inteiro, manter exatamente o mesmo lado do corpo, perfil e posição da foto de referência',
        Costas:'vista posterior de corpo inteiro, manter enquadramento de costas e posição dos braços e pernas da foto de referência'
      };
      const editPrompt=`Edite a foto de referência de ${cleanStudent}. Gere uma projeção visual realista do mesmo adulto, aplicando somente a transformação corporal solicitada: ${cleanPrompt}. Prazo informado para o cenário: ${String(duration||'não informado').slice(0,30)}. Ângulo solicitado: ${angleRules[view]}. Preserve a identidade visual reconhecível da pessoa, tom de pele, cabelo, tatuagens e demais características individuais visíveis; preserve a pose, perspectiva, enquadramento, cenário e roupa originais. Altere as proporções do corpo de modo coerente com o pedido, mantendo anatomia humana natural. Não acrescente objetos, pessoas, texto, comparação lado a lado ou elementos gráficos. Entregue somente a imagem editada, sem explicações.`;
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),180000);
      let api;
      try{
        api=await fetch('https://openrouter.ai/api/v1/images',{method:'POST',signal:controller.signal,headers:{
          'Authorization':`Bearer ${key}`,'Content-Type':'application/json',
          'HTTP-Referer':'http://localhost:8080','X-OpenRouter-Title':'Body Lab Future Body'
        },body:JSON.stringify({model,prompt:editPrompt,input_references:[{type:'image_url',image_url:{url:images[view]}}],quality:'medium',output_format:'png'})});
      }finally{clearTimeout(timeout)}
      const data=await api.json().catch(()=>({}));
      if(!api.ok){
        const detail=data?.error?.message||data?.message||`resposta HTTP ${api.status}`;
        const error=new Error(`OpenRouter (${api.status}) na vista ${view}: ${detail}`);error.status=api.status;throw error;
      }
      const image=data?.data?.[0];
      if(!image?.b64_json) throw new Error(`O modelo não retornou a imagem de ${view}.`);
      const mime=image.media_type||'image/png';
      return {view,dataUrl:`data:${mime};base64,${image.b64_json}`};
    }));
    res.json({images:results,model,student:cleanStudent,duration});
  }catch(err){
    console.error('Future Body:',err.message);
    res.status(err.status|| (err.name==='AbortError'?504:500)).json({error:err.name==='AbortError'?'A geração demorou demais. Tente novamente com fotos menores.':err.message||'Erro ao gerar as projeções.'});
  }
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const port=process.env.PORT||8080;
app.listen(port,'0.0.0.0',()=>console.log(`\nBODY LAB OpenRouter rodando em http://localhost:${port}\n`));
