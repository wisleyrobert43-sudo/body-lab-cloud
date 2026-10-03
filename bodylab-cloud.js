(() => {
  'use strict';

  const CLOUD_VERSION = 'bodylab-cloud-20261003-3';
  const state = {
    config: null,
    session: null,
    user: null,
    professional: null,
    students: [],
    selectedStudentId: localStorage.getItem('bodylab_selected_student') || '',
    strengthCatalog: [],
    currentStrengthAssessmentId: null
  };

  const q = (sel, root=document) => root.querySelector(sel);
  const qa = (sel, root=document) => [...root.querySelectorAll(sel)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const isoToday = () => new Date().toISOString().slice(0,10);
  const numOrNull = value => {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  function cloudToast(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else alert(message);
  }

  function tokenHeaders(extra={}) {
    const key = state.config?.supabaseKey;
    const token = state.session?.access_token;
    return {
      'apikey': key || '',
      ...(token ? {'Authorization': `Bearer ${token}`} : {}),
      ...extra
    };
  }

  async function jsonResponse(response) {
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); }
      catch { data = text; }
    }
    if (!response.ok) {
      const msg = data?.msg || data?.message || data?.error_description || data?.error || (typeof data === 'string' ? data : '') || `Erro HTTP ${response.status}`;
      const error = new Error(msg);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async function loadConfig() {
    const response = await fetch('/api/config', {cache:'no-store'});
    const data = await jsonResponse(response);
    state.config = data;
    return data;
  }

  async function authRequest(path, options={}) {
    const url = `${state.config.supabaseUrl}/auth/v1/${path}`;
    const response = await fetch(url, {
      ...options,
      headers: tokenHeaders({'Content-Type':'application/json', ...(options.headers || {})})
    });
    return jsonResponse(response);
  }

  async function rest(table, {method='GET', query='', body, prefer='return=representation'}={}) {
    const suffix = query ? (query.startsWith('?') ? query : `?${query}`) : '';
    const response = await fetch(`${state.config.supabaseUrl}/rest/v1/${table}${suffix}`, {
      method,
      headers: tokenHeaders({
        'Content-Type':'application/json',
        'Prefer': prefer
      }),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return jsonResponse(response);
  }

  async function storageUpload(path, blob) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${state.config.supabaseUrl}/storage/v1/object/body-lab-private/${encodedPath}`, {
      method:'POST',
      headers: tokenHeaders({
        'Content-Type': blob.type || 'application/octet-stream',
        'x-upsert':'true'
      }),
      body: blob
    });
    return jsonResponse(response);
  }

  function saveSession(session) {
    if (!session?.access_token) return;
    state.session = session;
    localStorage.setItem('bodylab_session', JSON.stringify(session));
  }

  function clearSession() {
    state.session = null;
    state.user = null;
    state.professional = null;
    localStorage.removeItem('bodylab_session');
  }

  async function refreshSessionIfNeeded() {
    let session = null;
    try { session = JSON.parse(localStorage.getItem('bodylab_session') || 'null'); } catch {}
    if (!session?.access_token) return false;
    state.session = session;
    const now = Math.floor(Date.now()/1000);
    if (session.expires_at && session.expires_at < now + 90 && session.refresh_token) {
      try {
        const fresh = await authRequest('token?grant_type=refresh_token', {
          method:'POST', body: JSON.stringify({refresh_token: session.refresh_token})
        });
        saveSession(fresh);
      } catch {
        clearSession();
        return false;
      }
    }
    try {
      state.user = await authRequest('user', {method:'GET'});
      return true;
    } catch {
      if (session.refresh_token) {
        try {
          const fresh = await authRequest('token?grant_type=refresh_token', {
            method:'POST', body: JSON.stringify({refresh_token: session.refresh_token})
          });
          saveSession(fresh);
          state.user = await authRequest('user', {method:'GET'});
          return true;
        } catch {}
      }
      clearSession();
      return false;
    }
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .cloudUser{margin-top:auto;padding-top:14px;border-top:1px solid #242a30;font-size:12px;color:#8f979d}.cloudUser b{color:#f7f7f4;display:block;margin-bottom:5px}.cloudUser button{margin-top:8px;width:100%}
      .cloudSetup{border:1px solid #705526;background:#17130a;padding:10px;border-radius:10px;color:#f2d99b;font-size:11px;margin-top:12px}
      .cloudBar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0}.studentBadge{border:1px solid #4d3b16;border-radius:12px;padding:9px 12px;background:#111007;color:#f6d77d;font-weight:800}
      .cloudTableWrap{overflow:auto}.cloudActions{display:flex;gap:7px;flex-wrap:wrap}.smallBtn{border:1px solid #303941;background:#111519;color:#f7f7f4;border-radius:8px;padding:7px 9px;cursor:pointer}.smallBtn.primary{background:#f0b429;color:#160e03;border-color:#f0b429}
      .cloudEmpty{padding:26px;text-align:center;color:#8f979d;border:1px dashed #303941;border-radius:14px}.historyItem{display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #242a30}.historyItem:last-child{border-bottom:0}
      .strengthGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.strengthCard{border:1px solid #242a30;background:#0d1012;border-radius:14px;padding:14px}.strengthSide{padding:10px 0;border-top:1px solid #242a30}.attempts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.attempts input{width:100%;background:#090b0d;border:1px solid #303941;color:white;border-radius:9px;padding:9px}.strengthResult{margin-top:16px}.barRow{display:grid;grid-template-columns:minmax(145px,1.5fr) 90px 1fr 80px;gap:9px;align-items:center;padding:9px 0;border-bottom:1px solid #242a30}.barTrack{height:12px;background:#161b1f;border-radius:99px;overflow:hidden}.barFill{height:100%;background:#f0b429;border-radius:99px}.barFill.alt{opacity:.58}.statusNormal{color:#71d895}.statusObserve{color:#f2d99b}.statusIntervene{color:#ff8585}.cloudSave{margin-left:auto}
      .cloudSelect{background:#090b0d;border:1px solid #303941;color:white;border-radius:10px;padding:10px;min-width:230px}
      @media(max-width:900px){.strengthGrid{grid-template-columns:1fr}.historyItem{grid-template-columns:1fr}.barRow{grid-template-columns:1fr 70px}.barTrack{grid-column:1/-1}.cloudSave{margin-left:0}}
    `;
    document.head.append(style);
  }

  function buildAuth() {
    const overlay = document.createElement('div');
    overlay.id = 'cloudAuth';
    overlay.className = 'cloudAuth';
    overlay.innerHTML = `
      <div class="authShell">
        <section class="authVisual" aria-hidden="true">
          <div class="authBrand">
            <div class="authBrandLogo">BODY <span>LAB</span></div>
            <div class="authBrandSub">Avaliação física, evolução e performance em um só lugar.</div>
          </div>
          <div class="authValueList">
            <div class="authValue">Avaliação precisa</div>
            <div class="authValue">Evolução real</div>
            <div class="authValue">Desempenho com propósito</div>
          </div>
          <div class="authStats">
            <div class="authStat"><b>Dados</b>organizados por aluno</div>
            <div class="authStat"><b>Histórico</b>comparação de evolução</div>
            <div class="authStat"><b>Performance</b>decisões com contexto</div>
          </div>
        </section>
        <section class="authFormPanel">
          <div class="authBox">
            <div class="authLogo">ACESSO PROFISSIONAL • <b>BODY LAB</b></div>
            <div class="authWelcome">Bem-vindo de volta</div>
            <div class="authLead">Acesse sua conta para acompanhar alunos, avaliações, fotos e evolução em um só lugar.</div>
            <div id="cloudConfigWarning" class="cloudSetup" style="display:none"></div>
            <div class="field"><label>E-mail</label><input id="authEmail" type="email" autocomplete="email" placeholder="seuemail@exemplo.com"></div>
            <div class="field"><label>Senha</label><div class="authPasswordWrap"><input id="authPassword" type="password" autocomplete="current-password" placeholder="Sua senha"><button type="button" class="authEye" id="authTogglePassword" aria-label="Mostrar senha">◉</button></div></div>
            <div class="authMeta">
              <label class="authCheck"><input id="authRemember" type="checkbox" checked> Manter conectado</label>
              <button type="button" class="authForgot" id="authForgot">Esqueci minha senha</button>
            </div>
            <button id="authSubmit" class="btn authSubmitPremium">ENTRAR NO BODY LAB →</button>
            <div id="authStatus" class="muted"></div>
            <div class="authTrust">Ambiente protegido para profissionais.</div>
          </div>
        </section>
      </div>`;
    document.body.append(overlay);
    document.body.classList.add('authLocked');

    q('#authTogglePassword').onclick=()=>{
      const input=q('#authPassword');
      input.type=input.type==='password'?'text':'password';
      q('#authTogglePassword').textContent=input.type==='password'?'◉':'◎';
    };
    q('#authForgot').onclick=async()=>{
      const email=q('#authEmail').value.trim();
      if(!email){q('#authStatus').textContent='Informe seu e-mail para recuperar o acesso.';return;}
      q('#authForgot').disabled=true;
      q('#authStatus').textContent='Enviando recuperação de senha...';
      try{
        await authRequest('recover',{method:'POST',body:JSON.stringify({email})});
        q('#authStatus').textContent='Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.';
      }catch(error){
        q('#authStatus').textContent=`Não foi possível solicitar a recuperação: ${error.message}`;
      }finally{q('#authForgot').disabled=false;}
    };
    q('#authSubmit').onclick=async()=>{
      const email=q('#authEmail').value.trim();
      const password=q('#authPassword').value;
      if(!email || password.length<6) return q('#authStatus').textContent='Informe e-mail e uma senha com pelo menos 6 caracteres.';
      q('#authSubmit').disabled=true;
      q('#authStatus').textContent='Entrando...';
      try{
        const session=await authRequest('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
        saveSession(session);state.user=session.user || await authRequest('user',{method:'GET'});
        await afterLogin();
      }catch(error){q('#authStatus').textContent=`Não foi possível entrar: ${error.message}`;}
      finally{q('#authSubmit').disabled=false;}
    };
    q('#authPassword').addEventListener('keydown',e=>{if(e.key==='Enter')q('#authSubmit').click();});
  }

  function addNavigationAndScreens() {
    const nav=q('#nav');
    if(nav && !q('[data-s="alunos"]',nav)){
      const alunos=document.createElement('button');alunos.dataset.s='alunos';alunos.textContent='♟ Alunos';
      const força=document.createElement('button');força.dataset.s='forca';força.textContent='◫ Força e Assimetria';
      const historico=document.createElement('button');historico.dataset.s='historico';historico.textContent='◷ Histórico';
      nav.insertBefore(alunos, nav.children[1] || null);
      nav.insertBefore(historico, nav.children[2] || null);
      nav.insertBefore(força, nav.children[4] || null);
      [alunos,historico,força].forEach(b=>b.onclick=()=>window.go(b.dataset.s));
    }

    const main=q('main.main');
    if(main && !q('#alunos')){
      main.insertAdjacentHTML('beforeend', `
        <section id="alunos" class="screen">
          <div class="top"><div><div class="eyebrow">BANCO DE ALUNOS</div><div class="h1">Alunos</div><div class="muted">Cada profissional visualiza somente os próprios alunos.</div></div><button class="btn" id="newStudentBtn">+ NOVO ALUNO</button></div>
          <div class="card" id="studentFormCard" style="display:none;margin-top:18px"><div class="row"><div class="field"><label>Nome completo</label><input id="studentFullName"></div><div class="field"><label>Nascimento</label><input id="studentBirth" type="date"></div><div class="field"><label>Sexo</label><select id="studentSex"><option value="">Não informado</option><option value="M">Masculino</option><option value="F">Feminino</option><option value="O">Outro / não informado</option></select></div></div><div class="row"><div class="field"><label>Telefone</label><input id="studentPhone"></div><div class="field"><label>E-mail</label><input id="studentEmail" type="email"></div><div class="field"><label>Instagram</label><input id="studentInstagram"></div></div><div class="row"><div class="field"><label>Objetivo</label><input id="studentGoal" placeholder="Ex.: hipertrofia, emagrecimento"></div><div class="field"><label>Observações</label><input id="studentNotes"></div></div><div class="row" style="margin-top:12px"><button class="btn" id="saveStudentBtn">SALVAR ALUNO</button><button class="btn secondary" id="cancelStudentBtn">CANCELAR</button></div></div>
          <div class="cloudBar"><input id="studentSearch" class="cloudSelect" placeholder="Buscar aluno..."><span id="studentCount" class="pill">0 alunos</span></div>
          <div class="card cloudTableWrap"><table><thead><tr><th>Aluno</th><th>Objetivo</th><th>Contato</th><th></th></tr></thead><tbody id="studentsTbody"></tbody></table><div id="studentsEmpty" class="cloudEmpty">Nenhum aluno cadastrado ainda.</div></div>
        </section>

        <section id="historico" class="screen">
          <div class="eyebrow">LINHA DO TEMPO</div><div class="h1">Histórico de avaliações</div>
          <div class="cloudBar"><select id="historyStudentSelect" class="cloudSelect"></select><button class="btn secondary" id="refreshHistoryBtn">ATUALIZAR</button></div>
          <div class="card"><div id="historyList" class="cloudEmpty">Selecione um aluno para visualizar o histórico.</div></div>
        </section>

        <section id="forca" class="screen">
          <div class="eyebrow">DINAMOMETRIA • TESTE DE FORÇA</div><div class="h1">Força e Assimetria</div>
          <p class="muted">Digite as leituras da balança/dinamômetro. O banco calcula melhor tentativa, média e assimetria entre os lados.</p>
          <div class="card"><div class="row"><div class="field"><label>Aluno</label><select id="strengthStudentSelect"></select></div><div class="field"><label>Data da avaliação</label><input id="strengthDate" type="date"></div><div class="field"><label>Unidade</label><select id="strengthUnit"><option value="kgf">kgf</option><option value="N">N</option><option value="lb">lb</option></select></div></div></div>
          <div id="strengthTests" class="strengthGrid" style="margin-top:14px"></div>
          <div class="row" style="margin-top:16px"><button id="saveStrengthBtn" class="btn">SALVAR TESTE DE FORÇA</button><button id="loadStrengthBtn" class="btn secondary">CARREGAR DA DATA</button></div>
          <div id="strengthSummary" class="strengthResult"></div>
        </section>`);
    }

    const side=q('.side');
    if(side && !q('#cloudUserBox')){
      side.insertAdjacentHTML('beforeend','<div class="cloudUser" id="cloudUserBox"><b id="cloudProfessionalName">Conta Body Lab</b><span id="cloudProfessionalEmail"></span><div id="cloudSelectedStudent" style="margin-top:8px">Nenhum aluno selecionado</div><button id="logoutBtn" class="smallBtn">SAIR</button></div>');
    }

    // IDs para os quatro cards do dashboard, sem reescrever o layout original.
    const metrics=qa('#dashboard .metric strong');
    if(metrics[0])metrics[0].id='dashStudents';
    if(metrics[1])metrics[1].id='dashAssessments';
    if(metrics[2])metrics[2].id='dashReassessments';
    if(metrics[3])metrics[3].id='dashProjections';

    // Botões de persistência nos módulos existentes.
    const metricResult=q('#metricResult');
    if(metricResult && !q('#saveMetricCloudBtn')){
      metricResult.insertAdjacentHTML('afterend','<div class="row" style="margin-top:12px"><button id="saveMetricCloudBtn" class="btn secondary">SALVAR NO HISTÓRICO</button><span id="metricCloudStatus" class="muted" style="align-self:center"></span></div>');
    }
    const visualSection=q('#avaliacao');
    if(visualSection && !q('#savePhotosCloudBtn')){
      visualSection.insertAdjacentHTML('beforeend','<div class="row" style="margin-top:14px"><button id="savePhotosCloudBtn" class="btn secondary">SALVAR FOTOS NO HISTÓRICO</button><span id="photoCloudStatus" class="muted" style="align-self:center"></span></div>');
    }
  }

  function currentStudent() {
    return state.students.find(s=>s.id===state.selectedStudentId) || null;
  }

  function syncSelectedStudent() {
    const student=currentStudent();
    q('#cloudSelectedStudent').textContent=student ? `Aluno: ${student.full_name}` : 'Nenhum aluno selecionado';
    if(q('#dashActiveStudent'))q('#dashActiveStudent').textContent=student ? `Aluno ativo: ${student.full_name}` : 'Nenhum aluno selecionado';
    ['historyStudentSelect','strengthStudentSelect'].forEach(id=>{
      const el=q('#'+id); if(el && state.selectedStudentId) el.value=state.selectedStudentId;
    });
    if(student){
      if(q('#metricName'))q('#metricName').value=student.full_name;
      if(q('#studentName'))q('#studentName').value=student.full_name;
      if(q('#futureStudent'))q('#futureStudent').value=student.full_name;
    }
  }

  function renderStudentOptions() {
    const options = `<option value="">Selecione um aluno</option>` + state.students.map(s=>`<option value="${esc(s.id)}">${esc(s.full_name)}</option>`).join('');
    ['historyStudentSelect','strengthStudentSelect'].forEach(id=>{const el=q('#'+id);if(el){el.innerHTML=options; if(state.selectedStudentId)el.value=state.selectedStudentId;}});
  }

  function renderStudents(filter='') {
    const tbody=q('#studentsTbody'), empty=q('#studentsEmpty');
    if(!tbody)return;
    const term=filter.trim().toLowerCase();
    const rows=state.students.filter(s=>!term || [s.full_name,s.goal,s.phone,s.email].some(v=>String(v||'').toLowerCase().includes(term)));
    tbody.innerHTML=rows.map(s=>`<tr><td><b>${esc(s.full_name)}</b><div class="muted">${esc(s.email||'')}</div></td><td>${esc(s.goal||'—')}</td><td>${esc(s.phone||'—')}</td><td><div class="cloudActions"><button class="smallBtn primary" data-select-student="${esc(s.id)}">SELECIONAR</button><button class="smallBtn" data-history-student="${esc(s.id)}">HISTÓRICO</button></div></td></tr>`).join('');
    empty.style.display=rows.length?'none':'block';
    q('#studentCount').textContent=`${state.students.length} aluno${state.students.length===1?'':'s'}`;
  }

  async function loadProfessional() {
    const rows=await rest('professionals',{query:`select=id,full_name,email,phone&id=eq.${encodeURIComponent(state.user.id)}&limit=1`});
    state.professional=rows?.[0] || null;
    const professionalName=state.professional?.full_name || 'Profissional';
    q('#cloudProfessionalName').textContent=professionalName === 'Profissional' ? 'Profissional Body Lab' : professionalName;
    q('#cloudProfessionalEmail').textContent=state.professional?.email || state.user?.email || '';
    if(q('#dashProfessionalName'))q('#dashProfessionalName').textContent=professionalName.split(' ')[0] || professionalName;
  }

  async function loadStudents() {
    state.students=await rest('students',{query:'select=id,full_name,birth_date,sex,phone,email,instagram,goal,notes,active,created_at&active=eq.true&order=full_name.asc'});
    if(state.selectedStudentId && !state.students.some(s=>s.id===state.selectedStudentId)) state.selectedStudentId='';
    if(!state.selectedStudentId && state.students.length) state.selectedStudentId=state.students[0].id;
    if(state.selectedStudentId){localStorage.setItem('bodylab_selected_student',state.selectedStudentId);} else localStorage.removeItem('bodylab_selected_student');
    renderStudents(q('#studentSearch')?.value || '');
    renderStudentOptions();
    syncSelectedStudent();
  }

  async function loadDashboard() {
    try{
      const [students, assessments]=await Promise.all([
        rest('students',{query:'select=id,full_name,goal,active&active=eq.true&order=full_name.asc'}),
        rest('assessments',{query:'select=id,student_id,assessment_date,status,objective,created_at&order=assessment_date.desc,created_at.desc'})
      ]);
      const uniqueStudents=new Set((assessments||[]).map(a=>a.student_id));
      const reassessments=Math.max(0,(assessments||[]).length-uniqueStudents.size);
      if(q('#dashStudents'))q('#dashStudents').textContent=students?.length||0;
      if(q('#dashAssessments'))q('#dashAssessments').textContent=assessments?.length||0;
      if(q('#dashReassessments'))q('#dashReassessments').textContent=reassessments;
      if(q('#dashProjections'))q('#dashProjections').textContent='—';
      const now=new Date();
      if(q('#dashGreetingLabel'))q('#dashGreetingLabel').textContent=now.getHours()<12?'Bom dia':now.getHours()<18?'Boa tarde':'Boa noite';
      if(q('#dashDate'))q('#dashDate').textContent=now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});

      const byId=new Map((students||[]).map(s=>[s.id,s]));
      const recent=(assessments||[]).slice(0,5);
      const tbody=q('#dashRecentTbody'), empty=q('#dashRecentEmpty');
      if(tbody){
        tbody.innerHTML=recent.map(a=>{
          const student=byId.get(a.student_id) || state.students.find(s=>s.id===a.student_id) || {};
          const name=student.full_name || 'Aluno';
          const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
          const type=a.objective || 'Avaliação física';
          const date=new Date(a.assessment_date+'T12:00:00').toLocaleDateString('pt-BR');
          const completed=(a.status||'completed').toLowerCase()==='completed';
          return `<tr>
            <td><div class="recentStudent"><span class="avatarMini">${esc(initials||'A')}</span><div><b>${esc(name)}</b><div class="muted">${esc(student.goal||'')}</div></div></div></td>
            <td>${esc(type)}</td>
            <td>${esc(date)}</td>
            <td><span class="statusPill ${completed?'':'pending'}">${completed?'✓ Concluída':'◷ '+esc(a.status||'Pendente')}</span></td>
            <td><button class="smallBtn" data-history-student="${esc(a.student_id)}">•••</button></td>
          </tr>`;
        }).join('');
        if(empty)empty.style.display=recent.length?'none':'block';
      }
    }catch(error){console.warn('Dashboard:',error.message);}
  }

  async function createStudent() {
    const full_name=q('#studentFullName').value.trim();
    if(!full_name)return cloudToast('Informe o nome do aluno.');
    q('#saveStudentBtn').disabled=true;
    try{
      const rows=await rest('students',{method:'POST',body:{
        professional_id: state.user.id,
        full_name,
        birth_date:q('#studentBirth').value||null,
        sex:q('#studentSex').value||null,
        phone:q('#studentPhone').value.trim()||null,
        email:q('#studentEmail').value.trim()||null,
        instagram:q('#studentInstagram').value.trim()||null,
        goal:q('#studentGoal').value.trim()||null,
        notes:q('#studentNotes').value.trim()||null
      }});
      if(rows?.[0])state.selectedStudentId=rows[0].id;
      q('#studentFormCard').style.display='none';
      ['studentFullName','studentBirth','studentPhone','studentEmail','studentInstagram','studentGoal','studentNotes'].forEach(id=>{if(q('#'+id))q('#'+id).value='';});
      if(q('#studentSex'))q('#studentSex').value='';
      await loadStudents();await loadDashboard();cloudToast('Aluno salvo no Body Lab.');
    }catch(error){cloudToast(`Erro ao salvar aluno: ${error.message}`);}
    finally{q('#saveStudentBtn').disabled=false;}
  }

  async function getOrCreateAssessment(studentId,date,objective='') {
    const existing=await rest('assessments',{query:`select=id,assessment_date,status,objective&student_id=eq.${encodeURIComponent(studentId)}&assessment_date=eq.${encodeURIComponent(date)}&order=created_at.asc&limit=1`});
    if(existing?.[0])return existing[0];
    const rows=await rest('assessments',{method:'POST',body:{professional_id:state.user.id,student_id:studentId,assessment_date:date,status:'completed',objective:objective||currentStudent()?.goal||null}});
    return rows[0];
  }

  async function upsert(table, body, conflict='assessment_id') {
    return rest(table,{method:'POST',query:`on_conflict=${encodeURIComponent(conflict)}`,body,prefer:'resolution=merge-duplicates,return=representation'});
  }

  function measurementByData(attr) {
    const out={};
    qa(`[${attr}]`).forEach(el=>{if(el.value.trim())out[el.getAttribute(attr)]=numOrNull(el.value);});
    return out;
  }

  async function saveMetricAssessment() {
    const status=q('#metricCloudStatus');
    const student=currentStudent();
    if(!student)return cloudToast('Selecione ou cadastre um aluno antes de salvar.');
    const d=window.getMetricResultData?.();
    if(!d)return cloudToast('Clique em CALCULAR AVALIAÇÃO antes de salvar.');
    status.textContent='Salvando...';q('#saveMetricCloudBtn').disabled=true;
    try{
      const assessment=await getOrCreateAssessment(student.id,d.date,student.goal||'');
      const bmi=d.weight&&d.height?Number((d.weight/Math.pow(d.height/100,2)).toFixed(2)):null;
      await upsert('anthropometry',{assessment_id:assessment.id,weight_kg:d.weight||null,height_cm:d.height||null,bmi});
      const method=q('#bodyMethod').value;
      if(method==='fold'){
        const f=measurementByData('data-fold');
        const sum=Object.values(f).filter(Number.isFinite).reduce((a,b)=>a+b,0);
        await upsert('skinfolds_7',{assessment_id:assessment.id,triceps_mm:f.triceps??null,subscapular_mm:f.subescapular??null,chest_mm:f.peitoral??null,midaxillary_mm:f.axilar??null,suprailiac_mm:f.supra??null,abdominal_mm:f.abdominal??null,thigh_mm:f.coxa??null,sum_7_mm:sum||null,body_fat_percentage:d.fat??null,protocol:'Jackson & Pollock 7'});
        const comp=measurementByData('data-fold-peri');
        await replaceCircumferences(assessment.id,comp);
      } else if(method==='navy'){
        await upsert('navy_method',{assessment_id:assessment.id,neck_cm:numOrNull(q('#navyNeck').value),waist_cm:numOrNull(q('#navyWaist').value),hip_cm:numOrNull(q('#navyHip').value),height_cm:d.height||null,body_fat_percentage:d.fat??null});
      } else {
        await replaceCircumferences(assessment.id,measurementByData('data-peri'));
      }
      if(d.fat!==null){
        const fatMass=d.weight?Number((d.weight*d.fat/100).toFixed(2)):null;
        const lean=d.weight&&fatMass!==null?Number((d.weight-fatMass).toFixed(2)):null;
        await upsert('body_composition',{assessment_id:assessment.id,method:d.method,body_fat_percentage:d.fat,fat_mass_kg:fatMass,lean_mass_kg:lean});
      }
      status.textContent='✓ Avaliação salva no histórico.';await loadDashboard();await loadHistory(student.id);
    }catch(error){status.textContent=`Erro: ${error.message}`;}
    finally{q('#saveMetricCloudBtn').disabled=false;}
  }

  async function replaceCircumferences(assessmentId, values) {
    await rest('circumference_measurements',{method:'DELETE',query:`assessment_id=eq.${encodeURIComponent(assessmentId)}`,prefer:'return=minimal'});
    const rows=Object.entries(values).filter(([,v])=>Number.isFinite(v)).map(([site,value_cm])=>({assessment_id:assessmentId,site,side:'central',value_cm}));
    if(rows.length)await rest('circumference_measurements',{method:'POST',body:rows});
  }

  async function dataUrlToBlob(dataUrl) {
    const response=await fetch(dataUrl);return response.blob();
  }

  async function savePhotosToHistory() {
    const student=currentStudent(),status=q('#photoCloudStatus');
    if(!student)return cloudToast('Selecione um aluno antes de salvar as fotos.');
    const monthA=q('#monthA').value,monthB=q('#monthB').value;
    if(!monthA||!monthB)return cloudToast('Informe os dois períodos antes de salvar.');
    const required=['Frente','Lateral','Costas'];
    const photoStore=window.getBodyLabPhotoStore?.();
    const missing=[];['A','B'].forEach(p=>required.forEach(v=>{if(!photoStore?.[p]?.[v])missing.push(`${p}-${v}`);}));
    if(missing.length)return cloudToast('Envie as 6 fotos antes de salvar no histórico.');
    q('#savePhotosCloudBtn').disabled=true;status.textContent='Enviando fotos privadas...';
    try{
      for(const [period,month] of [['A',monthA],['B',monthB]]){
        const assessment=await getOrCreateAssessment(student.id,`${month}-01`,student.goal||'');
        for(const view of required){
          const viewType=view==='Frente'?'front':view==='Costas'?'back':'left_side';
          const blob=await dataUrlToBlob(photoStore[period][view]);
          const path=`${state.user.id}/${student.id}/${assessment.id}/${viewType}.jpg`;
          await storageUpload(path,blob);
          const existing=await rest('assessment_photos',{query:`select=id&assessment_id=eq.${assessment.id}&view_type=eq.${viewType}&limit=1`});
          const payload={assessment_id:assessment.id,view_type:viewType,storage_path:path,analysis_text:period==='B'?(window.lastPhotoAnalysis?.resumo||null):null,analysis_json:period==='B'?(window.lastPhotoAnalysis||{}):{}};
          if(existing?.[0])await rest('assessment_photos',{method:'PATCH',query:`id=eq.${existing[0].id}`,body:payload});
          else await rest('assessment_photos',{method:'POST',body:payload});
        }
      }
      status.textContent='✓ Fotos salvas no armazenamento privado.';await loadDashboard();
    }catch(error){status.textContent=`Erro: ${error.message}`;}
    finally{q('#savePhotosCloudBtn').disabled=false;}
  }

  async function loadStrengthCatalog() {
    state.strengthCatalog=await rest('strength_test_catalog',{query:'select=code,display_name,muscle_group,modality,allowed_sides,sort_order&active=eq.true&order=sort_order.asc'});
    renderStrengthCatalog();
  }

  function sideLabel(side){return side==='right'?'Direito':side==='left'?'Esquerdo':'Bilateral / simultâneo';}

  function renderStrengthCatalog() {
    const host=q('#strengthTests');if(!host)return;
    host.innerHTML=state.strengthCatalog.map(test=>`<div class="strengthCard" data-test-code="${esc(test.code)}"><div class="eyebrow">${esc(test.muscle_group)}</div><h3 style="margin:4px 0 10px">${esc(test.display_name)}</h3>${(test.allowed_sides||[]).map(side=>`<div class="strengthSide" data-side="${esc(side)}"><b>${sideLabel(side)}</b><div class="attempts" style="margin-top:8px"><input type="number" step="0.01" min="0" data-attempt="1" placeholder="Tentativa 1"><input type="number" step="0.01" min="0" data-attempt="2" placeholder="Tentativa 2"><input type="number" step="0.01" min="0" data-attempt="3" placeholder="Tentativa 3"></div></div>`).join('')}</div>`).join('');
  }

  function collectStrengthRows(assessmentId) {
    const unit=q('#strengthUnit').value;
    const rows=[];
    qa('.strengthCard').forEach(card=>{
      const code=card.dataset.testCode;
      const test=state.strengthCatalog.find(t=>t.code===code);if(!test)return;
      qa('.strengthSide',card).forEach(sideBox=>{
        const attempts=[1,2,3].map(i=>numOrNull(q(`[data-attempt="${i}"]`,sideBox).value));
        if(attempts.every(v=>v===null))return;
        rows.push({assessment_id:assessmentId,test_code:code,test_name:test.display_name,muscle_group:test.muscle_group,modality:test.modality,side:sideBox.dataset.side,attempt_1:attempts[0],attempt_2:attempts[1],attempt_3:attempts[2],unit});
      });
    });
    return rows;
  }

  async function saveStrength() {
    const studentId=q('#strengthStudentSelect').value || state.selectedStudentId;
    const date=q('#strengthDate').value;
    if(!studentId||!date)return cloudToast('Selecione o aluno e a data.');
    state.selectedStudentId=studentId;localStorage.setItem('bodylab_selected_student',studentId);syncSelectedStudent();
    q('#saveStrengthBtn').disabled=true;
    try{
      const assessment=await getOrCreateAssessment(studentId,date,currentStudent()?.goal||'');
      const rows=collectStrengthRows(assessment.id);
      if(!rows.length)throw new Error('Preencha ao menos uma tentativa de força.');
      // Para esta data, recria somente os testes informados na tela, evitando duplicidade.
      const codes=[...new Set(rows.map(r=>r.test_code))];
      for(const code of codes)await rest('strength_tests',{method:'DELETE',query:`assessment_id=eq.${assessment.id}&test_code=eq.${encodeURIComponent(code)}`,prefer:'return=minimal'});
      await rest('strength_tests',{method:'POST',body:rows});
      state.currentStrengthAssessmentId=assessment.id;
      await renderStrengthResults(assessment.id);await loadDashboard();
      cloudToast('Teste de força salvo no histórico.');
    }catch(error){cloudToast(`Erro ao salvar força: ${error.message}`);}
    finally{q('#saveStrengthBtn').disabled=false;}
  }

  async function loadStrengthForDate() {
    const studentId=q('#strengthStudentSelect').value || state.selectedStudentId,date=q('#strengthDate').value;
    if(!studentId||!date)return cloudToast('Selecione o aluno e a data.');
    qa('#strengthTests input').forEach(i=>i.value='');
    const assessments=await rest('assessments',{query:`select=id&student_id=eq.${studentId}&assessment_date=eq.${date}&limit=1`});
    if(!assessments?.[0]){q('#strengthSummary').innerHTML='<div class="notice">Nenhum teste de força salvo nessa data.</div>';return;}
    const assessmentId=assessments[0].id;state.currentStrengthAssessmentId=assessmentId;
    const tests=await rest('strength_tests',{query:`select=test_code,side,attempt_1,attempt_2,attempt_3,best_result,average_result,unit&assessment_id=eq.${assessmentId}`});
    for(const row of tests){
      const card=q(`.strengthCard[data-test-code="${CSS.escape(row.test_code)}"]`);if(!card)continue;
      const side=q(`.strengthSide[data-side="${row.side}"]`,card);if(!side)continue;
      [row.attempt_1,row.attempt_2,row.attempt_3].forEach((v,i)=>{q(`[data-attempt="${i+1}"]`,side).value=v??'';});
    }
    if(tests[0]?.unit)q('#strengthUnit').value=tests[0].unit;
    await renderStrengthResults(assessmentId);
  }

  function asymmetryStatus(value) {
    if(value==null)return {label:'—',cls:''};
    if(value<=10)return {label:'Normal',cls:'statusNormal'};
    if(value<=20)return {label:'Observar',cls:'statusObserve'};
    return {label:'Intervir',cls:'statusIntervene'};
  }

  async function renderStrengthResults(assessmentId) {
    const [asym,tests]=await Promise.all([
      rest('v_strength_asymmetry',{query:`select=test_key,test_name,muscle_group,right_result,left_result,absolute_difference,asymmetry_percentage,unit&assessment_id=eq.${assessmentId}`}),
      rest('strength_tests',{query:`select=test_code,test_name,side,best_result,average_result,unit&assessment_id=eq.${assessmentId}&order=test_name.asc`})
    ]);
    const max=Math.max(1,...tests.map(t=>Number(t.best_result)||0));
    const bilateral=tests.filter(t=>t.side==='bilateral');
    const asymHtml=(asym||[]).map(row=>{
      const status=asymmetryStatus(Number(row.asymmetry_percentage));
      const right=Number(row.right_result)||0,left=Number(row.left_result)||0;
      return `<div class="card" style="margin-top:10px"><div class="top"><div><b>${esc(row.test_name)}</b><div class="muted">${esc(row.muscle_group||'')}</div></div><span class="pill ${status.cls}">${Number(row.asymmetry_percentage).toLocaleString('pt-BR',{maximumFractionDigits:2})}% • ${status.label}</span></div><div class="barRow"><span>Direito</span><b>${right.toLocaleString('pt-BR')} ${esc(row.unit||'kgf')}</b><div class="barTrack"><div class="barFill" style="width:${Math.min(100,right/max*100)}%"></div></div><span></span></div><div class="barRow"><span>Esquerdo</span><b>${left.toLocaleString('pt-BR')} ${esc(row.unit||'kgf')}</b><div class="barTrack"><div class="barFill alt" style="width:${Math.min(100,left/max*100)}%"></div></div><span></span></div><div class="muted" style="margin-top:8px">Diferença absoluta: ${Number(row.absolute_difference).toLocaleString('pt-BR',{maximumFractionDigits:2})} ${esc(row.unit||'kgf')}</div></div>`;
    }).join('');
    const bilateralHtml=bilateral.length?`<div class="card" style="margin-top:10px"><div class="eyebrow">TESTES BILATERAIS</div>${bilateral.map(row=>`<div class="barRow"><span>${esc(row.test_name)}</span><b>${Number(row.best_result||0).toLocaleString('pt-BR',{maximumFractionDigits:2})} ${esc(row.unit)}</b><div class="barTrack"><div class="barFill" style="width:${Math.min(100,(Number(row.best_result)||0)/max*100)}%"></div></div><span>Média ${Number(row.average_result||0).toLocaleString('pt-BR',{maximumFractionDigits:2})}</span></div>`).join('')}</div>`:'';
    q('#strengthSummary').innerHTML=(asymHtml||'<div class="notice">Os testes unilaterais aparecem aqui quando houver lado direito e esquerdo preenchidos.</div>')+bilateralHtml;
  }

  async function loadHistory(studentId=state.selectedStudentId) {
    const host=q('#historyList');if(!host)return;
    if(!studentId){host.className='cloudEmpty';host.textContent='Selecione um aluno para visualizar o histórico.';return;}
    state.selectedStudentId=studentId;localStorage.setItem('bodylab_selected_student',studentId);syncSelectedStudent();
    host.className='';host.innerHTML='<div class="muted">Carregando histórico...</div>';
    try{
      const assessments=await rest('assessments',{query:`select=id,assessment_date,status,objective,general_notes,created_at&student_id=eq.${studentId}&order=assessment_date.desc`});
      if(!assessments.length){host.className='cloudEmpty';host.textContent='Este aluno ainda não possui avaliações salvas.';return;}
      const ids=assessments.map(a=>a.id);
      // Quantidades por avaliação; as consultas são pequenas e deixam o resumo fácil de entender.
      const [anth,folds,navy,photos,strength]=await Promise.all([
        rest('anthropometry',{query:`select=assessment_id,weight_kg,height_cm,bmi&assessment_id=in.(${ids.join(',')})`}),
        rest('skinfolds_7',{query:`select=assessment_id,body_fat_percentage,sum_7_mm&assessment_id=in.(${ids.join(',')})`}),
        rest('navy_method',{query:`select=assessment_id,body_fat_percentage&assessment_id=in.(${ids.join(',')})`}),
        rest('assessment_photos',{query:`select=assessment_id,id&assessment_id=in.(${ids.join(',')})`}),
        rest('strength_tests',{query:`select=assessment_id,id&assessment_id=in.(${ids.join(',')})`})
      ]);
      const by=(arr,id)=>arr.filter(x=>x.assessment_id===id);
      host.innerHTML=assessments.map(a=>{
        const ant=by(anth,a.id)[0],fold=by(folds,a.id)[0],nav=by(navy,a.id)[0],photoCount=by(photos,a.id).length,strengthCount=by(strength,a.id).length;
        const fat=fold?.body_fat_percentage??nav?.body_fat_percentage;
        const details=[ant?.weight_kg!=null?`${ant.weight_kg} kg`:null,fat!=null?`${Number(fat).toFixed(1)}% gordura`:null,photoCount?`${photoCount} fotos`:null,strengthCount?`${strengthCount} testes de força`:null].filter(Boolean).join(' • ')||'Avaliação registrada';
        return `<div class="historyItem"><div><b>${new Date(a.assessment_date+'T12:00:00').toLocaleDateString('pt-BR')}</b><div class="muted">${esc(a.status)}</div></div><div>${esc(details)}<div class="muted">${esc(a.objective||'')}</div></div><div class="cloudActions"><button class="smallBtn" data-open-strength="${a.id}" data-date="${a.assessment_date}">FORÇA</button></div></div>`;
      }).join('');
    }catch(error){host.className='cloudEmpty';host.textContent=`Erro ao carregar histórico: ${error.message}`;}
  }

  function wireEvents() {
    q('#logoutBtn').onclick=async()=>{
      try{await authRequest('logout',{method:'POST',body:'{}'});}catch{}
      clearSession();
      q('#cloudAuth').classList.remove('hidden');
      document.body.classList.add('authLocked');
    };
    q('#newStudentBtn').onclick=()=>q('#studentFormCard').style.display='block';
    q('#cancelStudentBtn').onclick=()=>q('#studentFormCard').style.display='none';
    q('#saveStudentBtn').onclick=createStudent;
    q('#studentSearch').oninput=e=>renderStudents(e.target.value);
    if(q('#dashSearch'))q('#dashSearch').addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const term=e.target.value.trim();
        window.go('alunos');
        if(q('#studentSearch')){q('#studentSearch').value=term;renderStudents(term);}
      }
    });
    q('#refreshHistoryBtn').onclick=()=>loadHistory(q('#historyStudentSelect').value);
    q('#historyStudentSelect').onchange=e=>loadHistory(e.target.value);
    q('#strengthStudentSelect').onchange=e=>{state.selectedStudentId=e.target.value;localStorage.setItem('bodylab_selected_student',e.target.value);syncSelectedStudent();};
    q('#saveStrengthBtn').onclick=saveStrength;
    q('#loadStrengthBtn').onclick=loadStrengthForDate;
    q('#saveMetricCloudBtn').onclick=saveMetricAssessment;
    q('#savePhotosCloudBtn').onclick=savePhotosToHistory;
    document.addEventListener('click',e=>{
      const select=e.target.closest('[data-select-student]');
      if(select){state.selectedStudentId=select.dataset.selectStudent;localStorage.setItem('bodylab_selected_student',state.selectedStudentId);syncSelectedStudent();cloudToast('Aluno selecionado.');}
      const hist=e.target.closest('[data-history-student]');
      if(hist){state.selectedStudentId=hist.dataset.historyStudent;localStorage.setItem('bodylab_selected_student',state.selectedStudentId);renderStudentOptions();syncSelectedStudent();window.go('historico');loadHistory(state.selectedStudentId);}
      const force=e.target.closest('[data-open-strength]');
      if(force){q('#strengthDate').value=force.dataset.date;window.go('forca');loadStrengthForDate();}
    });
  }

  async function afterLogin() {
    q('#cloudAuth').classList.add('hidden');
    document.body.classList.remove('authLocked');
    await Promise.all([loadProfessional(),loadStudents(),loadStrengthCatalog()]);
    await loadDashboard();
    if(state.selectedStudentId)await loadHistory(state.selectedStudentId);
  }

  async function init() {
    addStyles();buildAuth();addNavigationAndScreens();wireEvents();
    q('#strengthDate').value=isoToday();
    try{
      const config=await loadConfig();
      if(!config.supabaseConfigured){
        q('#cloudConfigWarning').style.display='block';
        q('#cloudConfigWarning').textContent='Falta configurar SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY) no arquivo .env. A integração com o banco está pronta, mas o login ficará bloqueado até adicionar a chave pública do projeto.';
        q('#authSubmit').disabled=true;
        return;
      }
      const ok=await refreshSessionIfNeeded();
      if(ok)await afterLogin();
    }catch(error){
      q('#cloudConfigWarning').style.display='block';
      q('#cloudConfigWarning').textContent=`Não foi possível iniciar a nuvem do Body Lab: ${error.message}`;
      q('#authSubmit').disabled=true;
    }
  }

  window.BodyLabCloud={state,loadStudents,loadHistory,CLOUD_VERSION};
  window.addEventListener('DOMContentLoaded',init);
})();
