const $ = s => document.querySelector(s),
      $$ = s => [...document.querySelectorAll(s)];

const money = n => '$' + (+n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const store = {
    get(k, d) {
        try {
            return JSON.parse(localStorage.getItem(k)) ?? d;
        } catch (e) {
            return d;
        }
    },
    set(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        } catch (e) {}
    }
};

const SUPABASE_STORAGE_URL = 'https://fagstdqaeyadnprmqmxs.supabase.co/storage/v1/object/public/productos/';

/* conexion api render*/
const Nexo = {
    MOCK: false,
    BASE: 'https://nexo-pos-3ob9.onrender.com/api',

    async _(path, method = 'GET', body) {
        const t = sessionStorage.getItem('nexo_token');
        const r = await fetch(this.BASE + path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(t ? { Authorization: 'Bearer ' + t } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(j.message || j.error || 'Ocurrió un error');
        return j;
    },

    get backUrls() {
        const b = location.origin + location.pathname;
        return {
            success: b + '?pago=ok',
            failure: b + '?pago=error',
            pending: b + '?pago=pendiente'
        };
    },

    get notifyUrl() {
        return this.BASE + '/payments/webhook';
    },

    async login({ username, password }) {
        return this._('/auth/login', 'POST', { username, password });
    },

    async register(d) {
        return this._('/auth/register', 'POST', d);
    },

    async recover({ email }) {
        return this._('/auth/recover', 'POST', { email }).catch(() => ({ ok: true }));
    },

    users: {
        async getAll() {
            return Nexo._('/auth/users', 'GET').catch(() => []);
        },
        async create(u) {
            return Nexo._('/auth/register', 'POST', {
                ...u,
                password: u.password || '12345678'
            });
        }
    },

    products: {
        async getAll() {
            return Nexo._('/productos', 'GET');
        },
        async save(p) {
            return Nexo._('/productos', 'POST', {
                nombre: p.n,
                categoria: p.c,
                precio: p.p,
                stock: p.s,
                stock_minimo: p.m,
                codigo_barras: p.code
            });
        },
        async update(p) {
            if (p && p.id) {
                return Nexo._('/productos/' + p.id, 'PUT', {
                    nombre: p.n,
                    categoria: p.c,
                    precio: p.p,
                    stock: p.s,
                    stock_minimo: p.m,
                    codigo_barras: p.code
                }).catch(() => {});
            }
        },
        async remove(id) {
            return Nexo._('/productos/' + id, 'DELETE');
        }
    },

    pay: {
        async charge({ amount, method, folio }) {
            return {
                status: 'approved',
                reference: 'NEXO-' + Date.now().toString(36).toUpperCase()
            };
        }
    },

    tickets: {
        async getAll() {
            return Nexo._('/tickets', 'GET').catch(() => []);
        },
        async save(t) {
            return Nexo._('/ventas', 'POST', {
                usuario_id: S.user?.id,
                cajero: t.cajero,
                tipo: t.type,
                metodo_pago: t.method,
                subtotal: t.sub,
                descuento: t.disc,
                iva: t.iva,
                total: t.total,
                items: t.items.map(i => ({
                    producto_id: i.id,
                    nombre: i.n,
                    cantidad: i.q,
                    precio_unitario: i.p,
                    subtotal: i.p * i.q
                }))
            });
        },
        async email(t, email) {
            return Nexo._('/tickets/' + t.folio + '/email', 'POST', { email }).catch(() => ({ ok: true }));
        }
    },

    settings: {
        async save(c) {
            store.set('nexo_cfg', c);
            return Nexo._('/settings', 'PUT', c).catch(() => c);
        }
    }
};

/* Estado global */
const S = {
    user: null,
    cart: [],
    cat: 'Todos',
    type: 'Mostrador',
    view: 'pos',
    scanFor: 'pos',
    cfg: store.get('nexo_cfg', { name: 'Mi negocio', iva: 16 }),
    users: [],
    products: [],
    tickets: []
};

const isAdmin = () => (S.user?.role || S.user?.rol) === 'admin';

function toast(t) {
    const e = $('#toast');
    e.textContent = t;
    e.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => e.classList.remove('on'), 2200);
}

async function loadAppData() {
    try {
        const [prods, tix, users] = await Promise.all([
            Nexo.products.getAll().catch(() => []),
            Nexo.tickets.getAll().catch(() => []),
            Nexo.users.getAll().catch(() => [])
        ]);

        if (Array.isArray(prods)) {
            S.products = prods.map(p => ({
                id: String(p.id || p.producto_id),
                n: p.nombre || p.n,
                c: p.categoria || p.c || 'Otros',
                p: Number(p.precio ?? p.p ?? 0),
                s: Number(p.stock ?? p.s ?? 0),
                m: Number(p.stock_minimo ?? p.m ?? 5),
                code: String(p.codigo_barras || p.code || ''),
                imagen_url: p.imagen_url || ''
            }));
        }

        if (Array.isArray(tix)) {
            S.tickets = tix.map((t, i) => ({
                folio: t.folio || ('N-' + String(t.id || i + 1).padStart(5, '0')),
                date: t.fecha || t.date || t.created_at || new Date().toISOString(),
                cajero: t.cajero || 'Cajero',
                type: t.tipo || t.type || 'Mostrador',
                items: (t.items || []).map(it => ({
                    id: String(it.producto_id || it.id),
                    n: it.nombre || it.n,
                    p: Number(it.precio_unitario ?? it.p ?? 0),
                    q: Number(it.cantidad ?? it.q ?? 1)
                })),
                sub: Number(t.subtotal ?? t.sub ?? t.total ?? 0),
                disc: Number(t.descuento ?? t.disc ?? 0),
                iva: Number(t.iva ?? 0),
                total: Number(t.total ?? 0),
                method: t.metodo_pago || t.method || 'Efectivo',
                received: Number(t.received ?? t.total ?? 0),
                change: Number(t.change ?? 0)
            }));
        }

        if (Array.isArray(users)) {
            S.users = users.map(u => ({
                id: u.id,
                name: u.nombre || u.name,
                username: u.username,
                email: u.email,
                role: u.rol || u.role || 'cajero'
            }));
        }
    } catch (e) {
        console.error('Error cargando datos:', e);
    }
}

/* Autenticación */
function form(f) {
    $$('.frm').forEach(x => x.classList.toggle('on', x.id === 'f-' + f));
    $$('#atabs button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    $('#atabs').hidden = f === 'recover';
    $$('.msg').forEach(m => m.textContent = '');
}

$$('[data-f]').forEach(b => b.onclick = () => form(b.dataset.f));

async function submit(e, fn, ok) {
    e.preventDefault();
    const f = e.target,
          d = Object.fromEntries(new FormData(f)),
          m = f.querySelector('.msg'),
          b = f.querySelector('.btn');

    m.className = 'msg';
    m.textContent = '';

    if ([...f.elements].some(x => x.required && !x.value.trim())) {
        return m.textContent = 'Completa todos los campos.';
    }
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) {
        return m.textContent = 'Escribe un correo válido.';
    }
    if (f.id === 'f-register' && d.password.length < 8) {
        return m.textContent = 'La contraseña necesita al menos 8 caracteres.';
    }

    b.disabled = true;
    try {
        const r = await fn(d);
        ok(r, m, f);
    } catch (x) {
        m.textContent = x.message;
    }
    b.disabled = false;
}

$('#f-login').onsubmit = e => submit(e, d => Nexo.login(d), async r => {
    try { sessionStorage.setItem('nexo_token', r.token); } catch (x) {}
    store.set('nexo_session', r.user);
    await loadAppData();
    enter(r.user);
});

$('#f-register').onsubmit = e => submit(e, d => Nexo.register(d), (r, m, f) => {
    f.reset();
    form('login');
    $('#f-login .msg').className = 'msg ok';
    $('#f-login .msg').textContent = 'Cuenta creada. Ya puedes ingresar.';
});

$('#f-recover').onsubmit = e => submit(e, d => Nexo.recover(d), (r, m) => {
    m.className = 'msg ok';
    m.textContent = 'Si el correo existe, recibirás un enlace.';
});

$('#out').onclick = () => {
    store.set('nexo_session', null);
    try { sessionStorage.removeItem('nexo_token'); } catch (x) {}
    S.user = null;
    S.cart = [];
    $('#app').hidden = true;
    $('#auth').hidden = false;
    form('login');
};

async function enter(u) {
    S.user = u;
    if (!S.products.length) await loadAppData();
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#wn').textContent = u.name || u.nombre;
    $('#wr').textContent = isAdmin() ? 'Admin' : 'Cajero';
    $$('[data-admin]').forEach(e => e.hidden = !isAdmin());
    $('#today').textContent = new Date().toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });
    go('pos');
}

/* Navegacion */
const TT = {
    pos: 'Caja',
    inv: 'Inventario',
    tix: 'Tickets',
    adm: 'Panel de administración'
};

function go(v) {
    S.view = v;
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $$('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
    $('#vt').textContent = TT[v];
    ({ pos: drawPos, inv: drawInv, tix: drawTix, adm: drawAdm })[v]();
    $('#q').closest('.srch').style.visibility = v === 'pos' || v === 'inv' ? 'visible' : 'hidden';
}

$('#nav').onclick = e => {
    const b = e.target.closest('button');
    if (b) go(b.dataset.v);
};

/* Caja */
const cats = () => ['Todos', ...new Set(S.products.map(p => p.c))];

function drawPos() {
    $('#chips').innerHTML = cats()
        .map(c => `<button class="${c === S.cat ? 'on' : ''}">${c}</button>`)
        .join('');

    const q = $('#q').value.trim().toLowerCase(),
          l = S.products.filter(p => (S.cat === 'Todos' || p.c === S.cat) && (!q || p.n.toLowerCase().includes(q) || p.code.includes(q)));

    $('#grid').innerHTML = l.map(p => `
        <button class="pc ${p.s < 1 ? 'zero' : ''}" data-id="${p.id}">
            <div class="th">
                ${p.imagen_url
                    ? `<img src="${p.imagen_url}" alt="${p.n}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit" onerror="this.outerHTML='<b>${p.n[0]}</b>'">`
                    : `<b>${p.n[0]}</b>`}
            </div>
            <h4>${p.n}</h4>
            <div class="pr">
                <b>${money(p.p)}</b>
                <span class="stk ${p.s <= p.m ? 'low' : ''}">${p.s} disp.</span>
            </div>
        </button>
    `).join('') || '<p class="empty">Sin resultados.</p>';

    drawCart();
}

$('#chips').onclick = e => {
    const b = e.target.closest('button');
    if (b) {
        S.cat = b.textContent;
        drawPos();
    }
};

$('#q').oninput = () => S.view === 'inv' ? drawInv() : drawPos();

$('#q').onkeydown = e => {
    if (e.key === 'Enter' && S.view === 'pos') {
        const p = S.products.find(x => x.code === e.target.value.trim());
        if (p) {
            add(p.id);
            e.target.value = '';
            drawPos();
        }
    }
};

$('#grid').onclick = e => {
    const c = e.target.closest('.pc');
    if (!c) return;
    const r = document.createElement('i'),
          b = c.getBoundingClientRect();
    r.className = 'rip';
    r.style.left = e.clientX - b.left + 'px';
    r.style.top = e.clientY - b.top + 'px';
    c.append(r);
    setTimeout(() => r.remove(), 800);
    add(c.dataset.id);
};

function add(id) {
    const p = S.products.find(x => x.id === String(id)),
          l = S.cart.find(x => x.id === String(id));
    if (!p) return;
    if ((l ? l.q : 0) >= p.s) return toast('Sin más existencias de ' + p.n);
    l ? l.q++ : S.cart.push({ id: String(id), q: 1 });
    drawCart();
}

function tot() {
    const sub = S.cart.reduce((a, l) => a + S.products.find(p => p.id === l.id).p * l.q, 0),
          dp = Math.min(100, Math.max(0, +$('#disc').value || 0)),
          d = sub * dp / 100,
          iva = (sub - d) * S.cfg.iva / 100;
    return { sub, disc: d, dp, iva, total: sub - d + iva };
}

function drawCart() {
    const t = tot(),
          n = S.cart.reduce((a, l) => a + l.q, 0);

    $('#lines').innerHTML = S.cart.length ? S.cart.map(l => {
        const p = S.products.find(x => x.id === l.id);
        return `
            <div class="ln">
                <h5>${p.n}</h5>
                <b>${money(p.p * l.q)}</b>
                <div class="q">
                    <button data-m="${p.id}">−</button>
                    <span>${l.q}</span>
                    <button data-a="${p.id}">+</button>
                </div>
            </div>
        `;
    }).join('') : '<p class="empty">Toca un producto o escanea un código para empezar.</p>';

    $('#s1').textContent = money(t.sub);
    $('#s2').textContent = '−' + money(t.disc);
    $('#s3').textContent = money(t.iva);
    $('#s4').textContent = money(t.total);
    $('#fc').textContent = n;
    $('#ft').textContent = money(t.total);
    $('#pay').disabled = !n;
    $('#folio').textContent = '#' + nextFolio();
}

const nextFolio = () => 'N-' + String(S.tickets.length + 1).padStart(5, '0');

$('#lines').onclick = e => {
    const m = e.target.closest('[data-m]'),
          a = e.target.closest('[data-a]');
    if (m) {
        const l = S.cart.find(x => x.id === m.dataset.m);
        if (--l.q < 1) S.cart = S.cart.filter(x => x !== l);
    }
    if (a) add(a.dataset.a);
    drawCart();
};

$('#disc').oninput = drawCart;

$('#seg').onclick = e => {
    const b = e.target.closest('button');
    if (b) {
        S.type = b.textContent;
        $$('#seg button').forEach(x => x.classList.toggle('on', x === b));
    }
};

$('#fab').onclick = () => $('#order').classList.add('on');
$('#oc').onclick = () => $('#order').classList.remove('on');

/* modales */
function open(id) {
    closeAll();
    $(id).classList.add('on');
    $('#veil').classList.add('on');
}

function closeAll() {
    $$('.modal').forEach(m => m.classList.remove('on'));
    $('#veil').classList.remove('on');
    stopScan();
}

$('#veil').onclick = closeAll;
$$('[data-close]').forEach(b => b.onclick = closeAll);
document.addEventListener('keydown', e => e.key === 'Escape' && closeAll());

/* Cobro */
let method = 'Efectivo';

$('#pay').onclick = () => {
    $('#order').classList.remove('on');
    const t = tot();
    $('#pt').textContent = money(t.total);
    $('#rec').value = '';
    $('#chg').textContent = money(0);
    $('#pm').textContent = '';
    open('#m-pay');
};

$('#ptabs').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    method = b.dataset.p;
    $$('#ptabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.pp').forEach(x => x.classList.toggle('on', x.dataset.p === method));
};

$('#rec').oninput = () => $('#chg').textContent = money(Math.max(0, (+$('#rec').value || 0) - tot().total));

function draft(t, ref) {
    return {
        folio: nextFolio(),
        date: new Date().toISOString(),
        cajero: S.user.name || S.user.nombre,
        type: S.type,
        items: S.cart.map(l => {
            const p = S.products.find(x => x.id === l.id);
            return { id: p.id, n: p.n, p: p.p, q: l.q };
        }),
        sub: t.sub,
        disc: t.disc,
        iva: t.iva,
        total: t.total,
        method,
        ref,
        received: method === 'Efectivo' ? +$('#rec').value : t.total,
        change: method === 'Efectivo' ? (+$('#rec').value - t.total) : 0
    };
}

async function finalize(tk) {
    await Nexo.tickets.save(tk);
    for (const i of tk.items) {
        const p = S.products.find(x => x.id === i.id);
        if (p) {
            p.s = Math.max(0, p.s - i.q);
            await Nexo.products.update(p);
        }
    }
    S.tickets.unshift(tk);
    S.cart = [];
    $('#disc').value = 0;
    drawPos();
    showTicket(tk);
}

$('#pgo').onclick = async () => {
    const t = tot(),
          b = $('#pgo'),
          m = $('#pm');
    m.textContent = '';
    let ref = '';

    if (method === 'Efectivo' && (+$('#rec').value || 0) < t.total - .001) {
        return m.textContent = 'El monto recibido es menor al total.';
    }

    b.disabled = true;
    b.textContent = 'Procesando…';
    try {
        if (method !== 'Efectivo') {
            const r = await Nexo.pay.charge({
                amount: t.total,
                method,
                folio: nextFolio()
            });
            if (r.redirectUrl) {
                store.set('nexo_pending', { tk: draft(t, ''), cart: S.cart });
                location.href = r.redirectUrl;
                return;
            }
            if (r.status !== 'approved') throw Error('Pago rechazado');
            ref = r.reference;
        }
        await finalize(draft(t, ref));
    } catch (x) {
        m.textContent = x.message;
    }
    b.disabled = false;
    b.textContent = 'Confirmar pago';
};

function showTicket(t) {
    const d = new Date(t.date);
    
    const itemsHtml = (t.items || []).map(i => `
        <div class="r" style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>${i.q} × ${i.n}</span>
            <span>${money(i.p * i.q)}</span>
        </div>
    `).join('');

    $('#paper').innerHTML = `
        <div class="c">
            <img src="assets/logo.jpg" alt="">
            <b>${S.cfg.name}</b><br>
            ${d.toLocaleString('es-MX')}<br>
            Ticket ${t.folio} · ${t.type}<br>
            Atendió: ${t.cajero}
        </div>
        <hr>
        <!-- Productos del ticket -->
        <div style="margin: 8px 0;">
            ${itemsHtml}
        </div>
        <hr>
        <div class="r"><span>Subtotal</span><span>${money(t.sub)}</span></div>
        ${t.disc ? `<div class="r"><span>Descuento</span><span>−${money(t.disc)}</span></div>` : ''}
        <div class="r"><span>IVA</span><span>${money(t.iva)}</span></div>
        <div class="r"><b>TOTAL</b><b>${money(t.total)}</b></div>
        <hr>
        <div class="r"><span>Pago</span><span>${t.method}</span></div>
        ${t.method === 'Efectivo' ? `
            <div class="r"><span>Recibido</span><span>${money(t.received)}</span></div>
            <div class="r"><span>Cambio</span><span>${money(t.change)}</span></div>
        ` : ''}
        ${t.ref ? `<div class="r"><span>Ref.</span><span>${t.ref}</span></div>` : ''}
        <div class="c" style="margin-top:12px">¡Gracias por tu compra!</div>
    `;
    
    $('#m-tix').dataset.f = t.folio;
    open('#m-tix');
}

$('#prt').onclick = () => print();

$('#mail').onclick = async () => {
    const e = prompt('Correo del cliente:');
    if (!e) return;
    try {
        await Nexo.tickets.email(S.tickets.find(t => t.folio === $('#m-tix').dataset.f), e);
        toast('Ticket enviado a ' + e);
    } catch (x) {
        toast(x.message);
    }
};

/* ====== Inventario ====== */
function drawInv() {
    const q = $('#q').value.trim().toLowerCase();
    $('#invT').innerHTML = S.products
        .filter(p => !q || p.n.toLowerCase().includes(q) || p.code.includes(q))
        .map(p => `
            <tr>
                <td><b>${p.n}</b></td>
                <td class="mono">${p.code}</td>
                <td>${p.c}</td>
                <td>${money(p.p)}</td>
                <td><span class="tag ${p.s <= p.m ? 'low' : ''}">${p.s}</span></td>
                ${isAdmin() ? `
                    <td>
                        <button class="lk" data-r="${p.id}">+10</button>
                        <button class="lk d" data-d="${p.id}">Eliminar</button>
                    </td>
                ` : ''}
            </tr>
        `).join('');
}

$('#invT').onclick = async e => {
    const r = e.target.closest('[data-r]'),
          d = e.target.closest('[data-d]');
    if (r) {
        const prod = S.products.find(p => p.id === r.dataset.r);
        prod.s += 10;
        await Nexo.products.update(prod);
        drawInv();
    }
    if (d && confirm('¿Eliminar este producto?')) {
        await Nexo.products.remove(d.dataset.d);
        S.products = S.products.filter(p => p.id !== d.dataset.d);
        drawInv();
    }
};

$('#pf').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    if (S.products.some(p => p.code === d.code.trim())) {
        return toast('Ya existe un producto con ese código');
    }
    const nuevo = {
        n: d.n.trim(),
        c: d.c,
        p: +d.p,
        s: +d.s,
        m: +d.m || 0,
        code: d.code.trim()
    };
    const saved = await Nexo.products.save(nuevo);
    const created = saved.producto || saved;
    S.products.push({
        ...nuevo,
        id: String(created.id || Date.now()),
        imagen_url: created.imagen_url || ''
    });
    e.target.reset();
    toast('Producto agregado');
    drawInv();
};

$('#pscan').onclick = () => startScan('inv');

/* Tickets */
function drawTix() {
    $('#tixT').innerHTML = S.tickets.map(t => `
        <tr>
            <td class="mono">${t.folio}</td>
            <td>${new Date(t.date).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
            <td>${t.cajero}</td>
            <td><span class="tag">${t.method}</span></td>
            <td><b>${money(t.total)}</b></td>
            <td><button class="lk" data-t="${t.folio}">Ver</button></td>
        </tr>
    `).join('');
}

$('#tixT').onclick = e => {
    const b = e.target.closest('[data-t]');
    if (b) showTicket(S.tickets.find(t => t.folio === b.dataset.t));
};

/* Panel admin */
function drawAdm() {
    if (!isAdmin()) return go('pos');
    const day = new Date().toDateString(),
          td = S.tickets.filter(t => new Date(t.date).toDateString() === day),
          sum = td.reduce((a, t) => a + t.total, 0),
          low = S.products.filter(p => p.s <= p.m).length;

    $('#kpis').innerHTML = [
        ['Ventas de hoy', money(sum)],
        ['Tickets', td.length],
        ['Ticket promedio', money(td.length ? sum / td.length : 0)],
        ['Stock bajo', low]
    ].map(k => `<div class="kpi"><small>${k[0]}</small><b>${k[1]}</b></div>`).join('');

    const hrs = [...Array(13)].map((_, i) => i + 8),
          by = hrs.map(h => td.filter(t => new Date(t.date).getHours() === h).reduce((a, t) => a + t.total, 0)),
          mx = Math.max(...by, 1);

    $('#bars').innerHTML = hrs.map((h, i) => `<div><i data-h="${by[i] / mx * 100}"></i>${h}</div>`).join('');

    const cnt = {};
    S.tickets.forEach(t => t.items.forEach(i => cnt[i.n] = (cnt[i.n] || 0) + i.q));
    const tp = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5);

    $('#top').innerHTML = tp.length ? tp.map(([n, q]) => `
        <div class="tr">
            <span>${n}</span>
            <b>${q}</b>
            <div class="bar"><i data-w="${q / tp[0][1] * 100}"></i></div>
        </div>
    `).join('') : '<p class="empty">Sin ventas aún</p>';

    requestAnimationFrame(() => requestAnimationFrame(() => {
        $$('#bars i').forEach(i => i.style.height = i.dataset.h + '%');
        $$('#top i').forEach(i => i.style.width = i.dataset.w + '%');
    }));

    $('#users').innerHTML = S.users.map(u => `
        <div class="urow">
            <span><b>${u.name}</b><small>@${u.username} · ${u.email}</small></span>
            <span class="tag">${u.role}</span>
        </div>
    `).join('');

    $('#bn').value = S.cfg.name;
    $('#iva').value = S.cfg.iva;
}

$('#uf').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.username = d.username.toLowerCase();
    if (S.users.some(u => u.username === d.username)) {
        return toast('Ese usuario ya existe');
    }
    await Nexo.users.create(d);
    await loadAppData();
    e.target.reset();
    toast('Usuario creado');
    drawAdm();
};

$('#sv').onclick = async () => {
    S.cfg = {
        name: $('#bn').value.trim() || 'Mi negocio',
        iva: Math.min(30, Math.max(0, +$('#iva').value || 0))
    };
    await Nexo.settings.save(S.cfg);
    toast('Ajustes guardados');
};

/* Escaner */
let stream, det, raf;

async function startScan(f = 'pos') {
    S.scanFor = f;
    open('#m-scan');
    const h = $('#sh');
    h.textContent = 'Apunta al código…';

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = $('#vid');
        v.srcObject = stream;
        await v.play();

        if ('BarcodeDetector' in window) {
            det = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'upc_a'] });
            let last = 0;
            const loop = async t => {
                if (!stream) return;
                if (t - last > 300) {
                    last = t;
                    try {
                        const r = await det.detect(v);
                        if (r[0]) return handleCode(r[0].rawValue);
                    } catch (x) {}
                }
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
        } else {
            h.textContent = 'Tu navegador no detecta códigos: escribe el código manualmente.';
        }
    } catch (x) {
        h.textContent = 'No se pudo abrir la cámara. Escribe el código manualmente.';
    }
}

function stopScan() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
}

function handleCode(code) {
    code = String(code).trim();
    if (S.scanFor === 'inv') {
        $('#pf [name=code]').value = code;
        closeAll();
        toast('Código leído: ' + code);
        return;
    }
    const p = S.products.find(x => x.code === code);
    if (p) {
        add(p.id);
        toast(p.n + ' agregado');
        if (navigator.vibrate) navigator.vibrate(60);
        closeAll();
    } else {
        toast('Código no registrado: ' + code);
        if (stream) raf = requestAnimationFrame(() => {});
    }
}

$('#scanBtn').onclick = () => startScan('pos');

$('#mf').onsubmit = e => {
    e.preventDefault();
    if ($('#man').value.trim()) handleCode($('#man').value);
    $('#man').value = '';
};

/* Red de nodos */
(function () {
    const c = $('#net'),
          x = c.getContext('2d');
    let w, h, N = [];

    const rs = () => {
        w = c.width = c.offsetWidth;
        h = c.height = c.offsetHeight;
        N = [...Array(Math.round(w * h / 16000))].map(() => ({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - .5) * .35,
            vy: (Math.random() - .5) * .35
        }));
    };

    rs();
    addEventListener('resize', rs);
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return draw(0);

    function draw(m = 1) {
        x.clearRect(0, 0, w, h);
        N.forEach(a => {
            if (m) {
                a.x += a.vx;
                a.y += a.vy;
                if (a.x < 0 || a.x > w) a.vx *= -1;
                if (a.y < 0 || a.y > h) a.vy *= -1;
            }
            x.fillStyle = 'rgba(255,255,255,.7)';
            x.beginPath();
            x.arc(a.x, a.y, 2.2, 0, 7);
            x.fill();

            N.forEach(b => {
                const d = Math.hypot(a.x - b.x, a.y - b.y);
                if (d < 130) {
                    x.strokeStyle = `rgba(255,255,255,${.28 * (1 - d / 130)})`;
                    x.beginPath();
                    x.moveTo(a.x, a.y);
                    x.lineTo(b.x, b.y);
                    x.stroke();
                }
            });
        });
        if (m) requestAnimationFrame(() => draw());
    }
    draw();
})();

/*inicio*/
(async function () {
    await loadAppData();
    const ses = store.get('nexo_session', null);
    if (ses) {
        const found = S.users.find(u => u.username === ses.username) || ses;
        await enter(found);
    }
})();

/* retorno pasarela*/
(function () {
    const q = new URLSearchParams(location.search),
          r = q.get('pago');
    if (!r) return;
    history.replaceState({}, '', location.pathname);

    const p = store.get('nexo_pending', null);
    if (!p || !S.user) return;
    store.set('nexo_pending', null);
    S.cart = p.cart;

    if (r === 'ok') {
        p.tk.ref = q.get('payment_id') || q.get('collection_id') || p.tk.ref;
        finalize(p.tk);
    } else {
        drawPos();
        toast(r === 'pendiente' ? 'Pago pendiente de confirmación' : 'El pago no se completó; tu orden sigue abierta');
    }
})();