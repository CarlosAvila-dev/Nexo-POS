const $ = s => document.querySelector(s),
      $$ = s => [...document.querySelectorAll(s)];

const money = n => '$' + (+n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

const SUPABASE_STORAGE_URL = 'https://fagstdqaeyadnprmqmxs.supabase.co/storage/v1/object/public/productos/';

const S = {
    user: null,
    cart: [],
    cat: 'Todos',
    type: 'Mostrador',
    view: 'pos',
    scanFor: 'pos',
    cfg: { name: 'Mi negocio', iva: 16 },
    users: [],
    products: [],
    tickets: []
};

/* Conexión de Backend */
const Nexo = {
    MOCK: false, 
    BASE: 'https://nexo-pos-3ob9.onrender.com/api',

    async _(path, method = 'GET', body) {
        const t = sessionStorage.getItem('nexo_token');
        const r = await fetch(this.BASE + path, {
            method,
            headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
            body: body ? JSON.stringify(body) : undefined
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(j.message || j.error || 'Ocurrió un error en la API');
        return j;
    },

    async login({ username, password }) {
        if (!this.MOCK) return this._('/auth/login', 'POST', { username, password });
    },

    async register(d) {
        if (!this.MOCK) return this._('/auth/register', 'POST', d);
    },

    users: {
        async create(u) {
            if (!Nexo.MOCK) return Nexo._('/auth/register', 'POST', u);
        },
        async getAll() {
            if (!Nexo.MOCK) return Nexo._('/auth/users', 'GET').catch(() => []);
            return [];
        }
    },

    products: {
        async getAll() {
            if (!Nexo.MOCK) return Nexo._('/productos', 'GET');
            return [];
        },
        async save(p) {
            if (!Nexo.MOCK) return Nexo._('/productos', 'POST', p);
        },
        async update(p) {
            if (!Nexo.MOCK) return Nexo._('/productos', 'PUT', p);
        },
        async remove(id) {
            if (!Nexo.MOCK) return Nexo._('/productos/' + id, 'DELETE');
        }
    },

    tickets: {
        async getAll() {
            if (!Nexo.MOCK) return Nexo._('/tickets', 'GET').catch(() => []);
            return [];
        },
        async save(t) {
            if (!Nexo.MOCK) return Nexo._('/ventas', 'POST', t);
        }
    },

    settings: {
        async save(c) {
            if (!Nexo.MOCK) return Nexo._('/settings', 'PUT', c);
            store.set('nexo_cfg', c);
        }
    }
};

async function loadAppData() {
    try {
        const [prods, tix, users] = await Promise.all([
            Nexo.products.getAll().catch(() => []),
            Nexo.tickets.getAll().catch(() => []),
            Nexo.users.getAll().catch(() => [])
        ]);
        if (prods.length) S.products = prods.map(p => ({
            id: p.id || p.producto_id,
            n: p.nombre || p.n,
            c: p.categoria || p.c,
            p: Number(p.precio || p.p),
            s: Number(p.stock ?? p.s ?? 0),
            m: Number(p.stock_minimo ?? p.m ?? 5),
            code: p.codigo_barras || p.code || '',
            imagen_url: p.imagen_url || ''
        }));
        if (tix.length) S.tickets = tix;
        if (users.length) S.users = users;
    } catch (e) {
        console.error('Error sincronizando con el backend:', e);
    }
}

/* Inicio de sesión */
function form(f) {
    $$('.frm').forEach(x => x.classList.toggle('on', x.id === 'f-' + f));
    $$('#atabs button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    $('#atabs').hidden = f === 'recover';
    $$('.msg').forEach(m => m.textContent = '');
}

$$('[data-f]').forEach(b => b.onclick = () => form(b.dataset.f));

async function submitAuth(e, fn, ok) {
    e.preventDefault();
    const f = e.target, d = Object.fromEntries(new FormData(f)), m = f.querySelector('.msg'), b = f.querySelector('.btn');
    m.className = 'msg';
    m.textContent = '';
    
    if ([...f.elements].some(x => x.required && !x.value.trim())) return m.textContent = 'Completa todos los campos.';
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return m.textContent = 'Escribe un correo válido.';
    if (f.id === 'f-register' && d.password.length < 8) return m.textContent = 'La contraseña necesita al menos 8 caracteres.';
    
    b.disabled = true;
    try {
        const r = await fn(d);
        ok(r, m, f);
    } catch (x) {
        m.textContent = x.message;
    }
    b.disabled = false;
}

$('#f-login').onsubmit = e => submitAuth(e, d => Nexo.login(d), async r => {
    try { sessionStorage.setItem('nexo_token', r.token); } catch (x) {}
    store.set('nexo_session', r.user);
    await loadAppData();
    enter(r.user);
});

$('#f-register').onsubmit = e => submitAuth(e, d => Nexo.register(d), (r, m, f) => {
    f.reset();
    form('login');
    $('#f-login .msg').className = 'msg ok';
    $('#f-login .msg').textContent = 'Cuenta creada. Ya puedes ingresar.';
});

async function enter(u) {
    S.user = u;
    await loadAppData();
    $('#auth').hidden = true;
    $('#app').hidden = false;
    $('#wn').textContent = u.name || u.nombre;
    $('#wr').textContent = (u.role || u.rol) === 'admin' ? 'Admin' : 'Cajero';
    go('pos');
}