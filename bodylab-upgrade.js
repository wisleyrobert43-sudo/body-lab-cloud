// Resultados só são gerados a partir de dados realmente preenchidos.
let metricResultData = null;
window.getMetricResultData = () => metricResultData;
const num = id => Number(String(document.getElementById(id)?.value || '').replace(',', '.'));
const fmt = value => new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 1}).format(value);
const safeName = () => (document.getElementById('metricName')?.value.trim() || document.getElementById('studentName')?.value.trim() || 'aluno').replace(/[^\p{L}\p{N} -]/gu,'').slice(0,50);

function calculateBody() {
  metricResultData = null;
  document.getElementById('metricPdfBtn').disabled = true;
  const method = document.getElementById('bodyMethod').value;
  const sex = document.getElementById('metricSex').value;
  const age = num('metricAge'), height = num('metricHeight'), weight = num('metricWeight');
  const name = document.getElementById('metricName').value.trim();
  const result = document.getElementById('metricResult');
  const date = document.getElementById('metricDate').value;
  if (!name || !date) return result.textContent = 'Informe o nome do aluno e a data da avaliação.';
  if (weight && (weight < 20 || weight > 400)) return result.textContent = 'Confira o peso informado.';
  let fat = null, label, measurements = [];
  if (method === 'peri') {
    label = 'Circunferências';
    const inputs = [...document.querySelectorAll('[data-peri]')];
    measurements = inputs.filter(el => el.value.trim()).map(el => ({label:el.parentElement.querySelector('label').textContent,value:Number(el.value.replace(',','.'))}));
    if (!measurements.length || measurements.some(m => !Number.isFinite(m.value) || m.value <= 0 || m.value > 300)) return result.textContent = 'Preencha ao menos uma circunferência válida.';
  } else {
    if (!sex || !Number.isFinite(height) || height < 100 || height > 240) return result.textContent = 'Informe sexo e altura válida para estimar o percentual.';
    if (method === 'navy') {
      label = 'Marinha Americana (circunferências)';
      const neck = num('navyNeck'), waist = num('navyWaist'), hip = num('navyHip');
      if (!(neck > 15 && neck < 70 && waist > 35 && waist < 250) || (sex === 'F' && !(hip > 40 && hip < 250)) || waist <= neck) return result.textContent = 'Confira pescoço, cintura e quadril (se feminino).';
      // Coeficientes desta versão usam polegadas; entradas da interface usam centímetros.
      const inch = cm => cm / 2.54;
      fat = sex === 'M'
        ? 86.010 * Math.log10(inch(waist - neck)) - 70.041 * Math.log10(inch(height)) + 36.76
        : 163.205 * Math.log10(inch(waist + hip - neck)) - 97.684 * Math.log10(inch(height)) - 78.387;
      measurements = [{label:'Pescoço (cm)',value:neck},{label:'Cintura / abdômen (cm)',value:waist}];
      if (sex === 'F') measurements.push({label:'Quadril (cm)',value:hip});
    } else {
      label = 'Jackson, Pollock e Ward • sete dobras';
      if (!Number.isInteger(age) || age < 18 || age > 65) return result.textContent = 'Informe idade entre 18 e 65 anos para o protocolo de sete dobras.';
      const inputs = [...document.querySelectorAll('[data-fold]')];
      measurements = inputs.map(el => ({label:el.parentElement.querySelector('label').textContent,value:Number(el.value.replace(',','.'))}));
      if (measurements.some(m => !Number.isFinite(m.value) || m.value <= 0 || m.value > 100)) return result.textContent = 'Preencha as sete dobras em milímetros com valores válidos.';
      const sum = measurements.reduce((total,m) => total + m.value,0);
      const density = sex === 'M'
        ? 1.112 - 0.00043499*sum + 0.00000055*sum*sum - 0.00028826*age
        : 1.097 - 0.00046971*sum + 0.00000056*sum*sum - 0.00012828*age;
      fat = 495 / density - 450;
      measurements.push({label:'Soma das dobras (mm)',value:sum});
      const complementary = [...document.querySelectorAll('[data-fold-peri]')]
        .filter(el => el.value.trim()).map(el => ({
          label:el.parentElement.querySelector('label').textContent,
          value:Number(el.value.replace(',','.'))
        }));
      if (complementary.some(m => !Number.isFinite(m.value) || m.value <= 0 || m.value > 300))
        return result.textContent = 'Confira as circunferências complementares em centímetros.';
      measurements.push(...complementary);
    }
    if (!Number.isFinite(fat) || fat < 2 || fat > 70) return result.textContent = 'O resultado saiu da faixa esperada. Confira as medidas antes de gerar o PDF.';
  }
  metricResultData = {name,date,method:label,sex,age,height,weight,measurements,fat};
  result.textContent = fat === null ? `${label}: ${measurements.map(m=>m.label+': '+fmt(m.value)).join(' • ')}. Sem estimativa de gordura.`
    : `Gordura corporal estimada: ${fmt(fat)}%. Método: ${label}. Revise as aferições antes de enviar.`;
  document.getElementById('metricPdfBtn').disabled = false;
}

function downloadBytes(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes],{type}));
  const link = document.createElement('a'); link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function addText(pdf,page,text,x,y,size=11,maxWidth=490) {
  const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
  let line = '';
  for (const word of String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'').split(/\s+/)) {
    if (!word) continue;
    const next = line ? line+' '+word : word;
    if (font.widthOfTextAtSize(next,size)>maxWidth && line) {page.drawText(line,{x,y,size,font});y-=size+6;line=word;}
    else line=next;
  }
  if(line){page.drawText(line,{x,y,size,font});y-=size+7;}
  return y;
}
function pdfPage(pdf,title) {
  const page = pdf.addPage([595,842]);
  page.drawRectangle({x:0,y:788,width:595,height:54,color:PDFLib.rgb(.12,.09,.05)});
  page.drawText(title,{x:38,y:808,size:17,font:pdf._font,color:PDFLib.rgb(.91,.74,.40)});
  return page;
}
async function downloadMetricPDF() {
  if (!metricResultData) return toast('Calcule a avaliação antes de baixar o PDF');
  const d=metricResultData, pdf=await PDFLib.PDFDocument.create();
  pdf._font=await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const page=pdfPage(pdf,'BODY LAB  |  AVALIACAO FISICA');
  let y=758;
  for(const line of [`Aluno: ${d.name}`,`Data: ${d.date}`,`Metodo: ${d.method}`]) y=await addText(pdf,page,line,38,y,13);
  y-=14;
  if (d.fat !== null) y=await addText(pdf,page,`Gordura corporal estimada: ${fmt(d.fat)}%`,38,y,17);
  if (d.weight) y=await addText(pdf,page,`Peso informado: ${fmt(d.weight)} kg`,38,y);
  if (d.height) y=await addText(pdf,page,`Altura informada: ${fmt(d.height)} cm`,38,y);
  if (d.age) y=await addText(pdf,page,`Idade informada: ${d.age} anos`,38,y);
  y-=18;
  for(const m of d.measurements) y=await addText(pdf,page,`${m.label}: ${fmt(m.value)}`,38,y);
  y-=24;
  await addText(pdf,page,'Estimativa antropometrica para acompanhamento. Revise medidas, tecnica e resultado antes de compartilhar.',38,y,10);
  downloadBytes(await pdf.save(),`body-lab-medidas-${safeName()}.pdf`,'application/pdf');
}

async function markedCanvas(host) {
  const image = host?.querySelector('img');
  if (!image?.complete || !image.naturalWidth) throw Error('Envie as fotos e execute a analise antes de baixar.');
  const canvas = document.createElement('canvas'); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  // object-fit:contain cria margens dentro do quadro; converta coordenadas do quadro para pixels reais.
  const W=host.clientWidth,H=host.clientHeight,scale=Math.min(W/canvas.width,H/canvas.height);
  const ox=(W-canvas.width*scale)/2,oy=(H-canvas.height*scale)/2;
  for(const ann of host.querySelectorAll('.annotation')) {
    const x=(parseFloat(ann.style.left)/100*W-ox)/scale;
    const y=(parseFloat(ann.style.top)/100*H-oy)/scale;
    const w=parseFloat(ann.style.width)/100*W/scale,h=parseFloat(ann.style.height)/100*H/scale;
    ctx.strokeStyle=ann.style.borderColor||'#e7c16d';ctx.lineWidth=Math.max(3,canvas.width/180);
    if (ann.dataset.posture === '1') {
      ctx.beginPath();ctx.moveTo(x,y-h/2);ctx.lineTo(x,y+h/2);
      ctx.moveTo(x-w/2,y-h*.15);ctx.lineTo(x+w/2,y-h*.15);ctx.stroke();
      continue;
    }
    ctx.beginPath();ctx.ellipse(x,y,Math.max(12,w/2),Math.max(12,h/2),0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x-w/2,y-h/2,Math.max(13,canvas.width/40),0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#101010';ctx.font=`bold ${Math.max(15,canvas.width/38)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ann.dataset.number||'M',x-w/2,y-h/2);
  }
  return canvas;
}
function photoHosts() {
  return [...document.querySelectorAll('.markHost')];
}
async function downloadMarkedImages() {
  try {
    const hosts=photoHosts();if(!hosts.length) throw Error('Analise as fotos primeiro.');
    for (const host of hosts) {
      const canvas=await markedCanvas(host);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));
      if(!blob)throw Error('Falha ao criar imagem.');
      downloadBytes(await blob.arrayBuffer(),`body-lab-${safeName()}-${host.dataset.period}-${host.dataset.view}.jpg`,'image/jpeg');
    }
    toast('Imagens marcadas baixadas. Confira os arquivos antes de enviar.');
  } catch(e){toast(e.message);}
}
async function downloadPhotoPDF() {
  try {
    const hosts=photoHosts();if(!hosts.length)throw Error('Analise as fotos primeiro.');
    const pdf=await PDFLib.PDFDocument.create();pdf._font=await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const a=window.lastPhotoAnalysis;
    if(a){const page=pdfPage(pdf,'BODY LAB  |  COMPARACAO VISUAL');let y=753;
      y=await addText(pdf,page,`Aluno: ${safeName()}`,38,y,13);y=await addText(pdf,page,`Periodos: ${document.getElementById('monthA').value} e ${document.getElementById('monthB').value}`,38,y);
      y-=10;y=await addText(pdf,page,a.resumo||'',38,y,12);
      for(const finding of (a.achados||[])) {
        if(y<95)break;
        y-=8;y=await addText(pdf,page,`${finding.numero}. ${finding.vista} / ${finding.regiao}: ${finding.mudanca}`,38,y,10);
      }
      await addText(pdf,page,'Comparacao visual, sem percentual de gordura ou diagnostico postural. Revise as marcacoes antes de compartilhar.',38,65,9);
    }
    for(const host of hosts){const canvas=await markedCanvas(host),jpeg=await pdf.embedJpg(canvas.toDataURL('image/jpeg',.85));
      const page=pdfPage(pdf,`PERIODO ${host.dataset.period}  |  ${host.dataset.view.toUpperCase()}`);
      const factor=Math.min(520/jpeg.width,710/jpeg.height);
      page.drawImage(jpeg,{x:(595-jpeg.width*factor)/2,y:50,width:jpeg.width*factor,height:jpeg.height*factor});
    }
    downloadBytes(await pdf.save(),`body-lab-fotos-${safeName()}.pdf`,'application/pdf');
  }catch(e){toast(e.message);}
}

document.getElementById('metricDate').value=new Date().toISOString().slice(0,10);
document.querySelectorAll('#medidas input,#medidas select').forEach(el=>el.addEventListener('input',()=>{metricResultData=null;document.getElementById('metricPdfBtn').disabled=true;}));

const futurePhotos={};
let futureGenerated=[];
function clearFutureResult(){
  futureGenerated=[];
  document.getElementById('futureResults').classList.remove('ready');
  document.getElementById('futurePlaceholder').style.display='grid';
  document.getElementById('futureGallery').innerHTML='';
}
function previewFuture(input){
  const file=input.files?.[0];if(!file)return;
  if(!file.type.startsWith('image/')){toast('Selecione uma imagem.');input.value='';return;}
  const view=input.closest('[data-future-view]').dataset.futureView;
  const reader=new FileReader();
  reader.onload=()=>{
    const source=new Image();
    source.onload=()=>{
      const scale=Math.min(1,1600/Math.max(source.naturalWidth,source.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
      canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);
      futurePhotos[view]=canvas.toDataURL('image/jpeg',.84);
      let thumb=input.parentElement.querySelector('img');if(!thumb){thumb=new Image();input.parentElement.prepend(thumb);}
      thumb.src=futurePhotos[view];input.parentElement.querySelector('span').style.display='none';
      clearFutureResult();document.getElementById('futureStatus').textContent=`Foto de ${view.toLowerCase()} adicionada.`;
    };
    source.onerror=()=>{toast('Não foi possível abrir essa imagem.');};source.src=reader.result;
  };
  reader.onerror=()=>toast('Não foi possível ler essa imagem.');reader.readAsDataURL(file);
}
async function generateFutureBody(){
  const button=document.getElementById('futureGenerateBtn'),status=document.getElementById('futureStatus');
  const prompt=document.getElementById('futurePrompt').value.trim();
  const views=['Frente','Lado','Costas'];
  if(!prompt){toast('Descreva a mudança que deseja visualizar.');return;}
  const missing=views.filter(view=>!futurePhotos[view]);
  if(missing.length){toast(`Envie as três fotos. Faltam: ${missing.join(', ')}.`);return;}
  try{
    const health=await fetch('/api/health',{cache:'no-store'}).then(r=>r.json());
    if(health.version!=='bodylab-cloud-20261003-3'){toast('Abra o Future Body pela versão nova do INICIAR.bat.');return;}
    if(!health.aiConfigured){toast('Configure sua chave OpenRouter no arquivo .env.');return;}
  }catch{toast('Servidor não conectado. Abra o INICIAR.bat da pasta atualizada.');return;}
  button.disabled=true;clearFutureResult();status.textContent='A IA está editando as três fotos. Isso pode levar alguns minutos.';
  try{
    const response=await fetch('/api/future-body',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({student:document.getElementById('futureStudent').value.trim(),duration:document.getElementById('futureDuration').value,prompt,images:futurePhotos})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Falha ao gerar as imagens.');
    if(!Array.isArray(data.images)||data.images.length!==3)throw new Error('A IA não retornou as três vistas. Tente novamente.');
    futureGenerated=data.images;const gallery=document.getElementById('futureGallery');gallery.innerHTML='';
    for(const item of futureGenerated){
      const card=document.createElement('div');card.className='card futureOutput';
      const label=document.createElement('b');label.textContent=item.view.toUpperCase();
      const image=new Image();image.alt=`Projeção Future Body, vista ${item.view}`;image.src=item.dataUrl;
      card.append(label,image);gallery.append(card);
    }
    document.getElementById('futureResultPeriod').textContent=document.getElementById('futureDuration').value.toUpperCase();
    document.getElementById('futurePlaceholder').style.display='none';document.getElementById('futureResults').classList.add('ready');
    status.textContent='✓ As três projeções foram geradas. Confira cada imagem antes de exportar.';toast('Future Body concluiu as três vistas.');
  }catch(e){status.textContent='Não foi possível gerar as imagens: '+e.message;toast('Falha na geração do Future Body.');}
  finally{button.disabled=false;}
}
function futureFilename(){
  const raw=document.getElementById('futureStudent').value.trim()||'aluno';
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,50)||'aluno';
}
async function downloadFutureImages(){
  if(futureGenerated.length!==3)return toast('Gere as três imagens antes de baixar.');
  for(const item of futureGenerated){const response=await fetch(item.dataUrl);const blob=await response.blob();downloadBytes(await blob.arrayBuffer(),`future-body-${futureFilename()}-${item.view.toLowerCase()}.png`,blob.type||'image/png');}
  toast('As três imagens foram baixadas.');
}
async function downloadFuturePDF(){
  if(futureGenerated.length!==3)return toast('Gere as três imagens antes de baixar o PDF.');
  const pdf=await PDFLib.PDFDocument.create();pdf._font=await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const summary=pdfPage(pdf,'BODY LAB  |  FUTURE BODY');let y=750;
  const name=document.getElementById('futureStudent').value.trim()||'Aluno';
  y=await addText(pdf,summary,`Aluno: ${name}`,38,y,14);
  y=await addText(pdf,summary,`Prazo da projecao: ${document.getElementById('futureDuration').value}`,38,y,12);
  y-=10;y=await addText(pdf,summary,'Transformacao solicitada:',38,y,12);
  y=await addText(pdf,summary,document.getElementById('futurePrompt').value.trim(),38,y-2,11);
  y-=18;await addText(pdf,summary,'Projecao visual ilustrativa gerada por IA a partir das fotos fornecidas. Nao representa previsao ou garantia de resultado. Revise as imagens antes de compartilhar.',38,y,10);
  for(const item of futureGenerated){
    const page=pdfPage(pdf,`FUTURE BODY  |  VISTA ${item.view.toUpperCase()}`);
    const bytes=await (await fetch(item.dataUrl)).arrayBuffer();
    const image=item.dataUrl.startsWith('data:image/png')?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
    const factor=Math.min(520/image.width,710/image.height);
    page.drawImage(image,{x:(595-image.width*factor)/2,y:54,width:image.width*factor,height:image.height*factor});
  }
  downloadBytes(await pdf.save(),`future-body-${futureFilename()}.pdf`,'application/pdf');
}
