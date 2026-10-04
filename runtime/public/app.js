    (() => {
        const params = new URLSearchParams(location.search);
        const stored = localStorage.getItem('aia_daemon_url') || '';
        const defaultDaemon = (location.protocol === 'http:' || location.protocol === 'https:')
            ? ''
            : 'http://127.0.0.1:3847';
        const API = (params.get('daemon') || params.get('api') || stored || defaultDaemon).replace(/\/$/, '');

        const SEED_PAYLOADS = [
            {
                agentId: 'agent_ghl_nurture_v1',
                packName: 'GoHighLevel Pipeline Automation',
                actionType: 'GHL_CONTACT_TAG_UPDATE',
                riskLevel: 'high',
                targetEndpoint: 'https://services.leadconnectorhq.com/contacts/batch/update',
                summary: 'Webhook received from GHL pipeline stage change. Automatically tag 84 leads as "Hot Prospect" and trigger SMS sequence via local vault API token.',
                diffData: {
                    before: { pipelineStage: 'New Lead', tags: ['inbound_web'], autoSmsActive: false },
                    after: { pipelineStage: 'Qualified Prospect', tags: ['inbound_web', 'Hot Prospect'], autoSmsActive: true }
                },
                resourceCost: { amount: '0.015', token: 'ETH (Gas)' },
                source: 'manual',
                timestamp: Date.now() - 42_000
            },
            {
                agentId: 'agent_superfluid_stream',
                packName: 'Superfluid Treasury Stream',
                actionType: 'SUPERFLUID_STREAM_MODIFY',
                riskLevel: 'critical',
                targetEndpoint: '0x8f3Cf7ad23Cd33B...f92C',
                summary: 'Agent logic.js evaluated weekly milestone completion. Adjust real-time payroll token stream flow rate by +10%.',
                diffData: {
                    before: { flowRatePerSec: '0.000010 ETH/s' },
                    after: { flowRatePerSec: '0.000011 ETH/s' }
                },
                resourceCost: { amount: '0.080', token: 'USDCx' },
                source: 'sandbox',
                timestamp: Date.now() - 180_000
            },
            {
                agentId: 'agent_social_publisher',
                packName: 'Autonomous Brand Pod',
                actionType: 'API_DISPATCH_TWITTER',
                riskLevel: 'medium',
                targetEndpoint: 'https://api.x.com/2/tweets',
                summary: 'Publish thread summarizing weekly sovereign agent swarm performance and local Provenance Ledger metrics.',
                diffData: {
                    before: { draftPublished: false, scheduledSlot: '12:00 UTC' },
                    after: { draftPublished: true, tweetId: '1893742910482' }
                },
                resourceCost: { amount: '0.001', token: 'ETH' },
                source: 'manual',
                timestamp: Date.now() - 950_000
            }
        ];

        const SIM_TEMPLATES = [
            { name: 'GoHighLevel SMS Broadcast', type: 'GHL_BULK_SMS_DISPATCH', risk: 'high', endpoint: 'https://services.leadconnectorhq.com/conversations/messages', desc: 'Inbound trigger: Send appointment reminder SMS to 34 contacts scheduled for tomorrow.', via: 'ghl' },
            { name: 'GoHighLevel Opportunity Move', type: 'GHL_OPP_PIPELINE_UPDATE', risk: 'medium', endpoint: 'https://services.leadconnectorhq.com/opportunities/update', desc: 'Inbound webhook: Move deal stage to "Contract Sent" based on form completion.', via: 'ghl' },
            { name: 'Autonomous Vault Transfer', type: 'SOL_VAULT_TRANSFER', risk: 'critical', endpoint: '0x49B...C102 (Mainnet Vault)', desc: 'Agent logic.js requests emergency liquidity allocation for arbitrage execution.', via: 'queue' },
            { name: 'Email Outreach Dispatch', type: 'SMTP_BULK_SEND', risk: 'low', endpoint: 'smtp.mailgun.org/v3/messages', desc: 'Dispatch weekly newsletter batch to 820 verified subscribers.', via: 'queue' }
        ];

        function escapeHtml(s) {
            return String(s || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function shortHash(seed) {
            let h = 0x811c9dc5;
            const str = String(seed) + ':' + Date.now();
            for (let i = 0; i < str.length; i++) {
                h ^= str.charCodeAt(i);
                h = Math.imul(h, 0x01000193);
            }
            return '0x' + (h >>> 0).toString(16).padStart(8, '0') + (Math.imul(h, 0x85ebca6b) >>> 0).toString(16).padStart(8, '0');
        }

        function mockSignature(cardId, digest) {
            const seed = `${cardId}:${digest}:${Date.now()}:${Math.random().toString(36)}`;
            let a = 0x811c9dc5, b = 0x01000193;
            const bytes = [];
            for (let i = 0; i < seed.length; i++) {
                const c = seed.charCodeAt(i);
                a ^= c; a = Math.imul(a, 0x01000193);
                b = Math.imul(b ^ (c << (i % 7)), 0x85ebca6b) >>> 0;
            }
            for (let i = 0; i < 32; i++) {
                a = Math.imul(a ^ (a >>> 13), 0x5bd1e995) >>> 0;
                b = Math.imul(b ^ (b >>> 16), 0x27d4eb2d) >>> 0;
                bytes.push(((a ^ b ^ (i * 0x9e3779b9)) & 0xff).toString(16).padStart(2, '0'));
                a = (a + 0x9e3779b9 + (b << 3)) >>> 0;
                b = (b + 0x6c078965 + (a >>> 5)) >>> 0;
            }
            return bytes.join('');
        }

        function compareRiskThenFifo(a, b) {
            const order = { critical: 0, high: 1, medium: 2, low: 3 };
            const ra = order[a.payload?.riskLevel] ?? 9;
            const rb = order[b.payload?.riskLevel] ?? 9;
            if (ra !== rb) return ra - rb;
            return (a.payload?.timestamp || 0) - (b.payload?.timestamp || 0);
        }

        function synthesizeMetaPrompt(card) {
            const p = card.payload || {};
            const meta = p.metaPrompt;
            if (meta && (meta.systemPrompt || meta.agentInstructions)) {
                const lines = [
                    `TEMPLATE · ${meta.templateId || 'runtime'}`,
                    `SYSTEM · ${meta.systemPrompt || ''}`.trim(),
                    `INSTRUCTIONS · ${meta.agentInstructions || ''}`.trim(),
                ];
                if (Array.isArray(meta.constraints) && meta.constraints.length) {
                    lines.push('CONSTRAINT · ' + meta.constraints.join(' · '));
                }
                if (p.source === 'recommendation' || p.recommendationKind) {
                    lines.push(`NEXT · recommendation/${p.recommendationKind || 'follow-up'} — still pending human YES`);
                }
                lines.push(`VERIFY · Diff before→after, then Ed25519 sign before dispatch to ${p.targetEndpoint || 'target'}.`);
                return lines.filter(Boolean).join('\n');
            }
            return [
                `SYSTEM · HITL gate for ${p.agentId || 'agent'}`,
                `ACTION · ${p.actionType || 'UNKNOWN'} @ risk=${(p.riskLevel || 'medium').toUpperCase()}`,
                `INTENT · ${p.summary || 'No summary'}`,
                `CONSTRAINT · Desk AIs draft only. Human Yes / Stop / Kill. Collect HOLD.`,
                p.source === 'recommendation'
                    ? `NEXT · recommendation/${p.recommendationKind || 'follow-up'} — still pending human YES`
                    : null,
                `VERIFY · Diff before→after, then Ed25519 sign before dispatch to ${p.targetEndpoint || 'target'}.`,
            ].filter(Boolean).join('\n');
        }

        class RealtimeBridge {
            constructor(apiBase, onEvent, onStatus) {
                this.apiBase = apiBase;
                this.onEvent = onEvent;
                this.onStatus = onStatus;
                this.ws = null;
                this.es = null;
                this.pollTimer = null;
                this.mode = 'idle';
                this.stopped = false;
            }

            start() {
                this.stopped = false;
                if (!this.apiBase && location.protocol === 'file:') {
                    this.onStatus('offline', 'FILE');
                    return;
                }
                this.connectWs();
            }

            stop() {
                this.stopped = true;
                this.teardown();
            }

            teardown() {
                if (this.ws) { try { this.ws.close(); } catch (_) {} this.ws = null; }
                if (this.es) { try { this.es.close(); } catch (_) {} this.es = null; }
                if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
            }

            wsUrl() {
                const base = this.apiBase || `${location.protocol}//${location.host}`;
                const u = new URL(base);
                u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
                u.pathname = '/ws';
                u.search = '';
                return u.toString();
            }

            connectWs() {
                if (this.stopped) return;
                this.teardown();
                let settled = false;
                const failTimer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try { this.ws?.close(); } catch (_) {}
                    this.connectSse();
                }, 1800);
                try {
                    this.ws = new WebSocket(this.wsUrl());
                    this.ws.onopen = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(failTimer);
                        this.mode = 'ws';
                        this.onStatus('ws', 'WS');
                        this.ws.send(JSON.stringify({ type: 'ping' }));
                    };
                    this.ws.onmessage = (ev) => {
                        try { this.onEvent(JSON.parse(ev.data)); } catch (_) {}
                    };
                    this.ws.onerror = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(failTimer);
                        this.connectSse();
                    };
                    this.ws.onclose = () => {
                        if (this.stopped) return;
                        if (this.mode === 'ws') {
                            this.mode = 'idle';
                            setTimeout(() => this.connectWs(), 2500);
                        }
                    };
                } catch (_) {
                    clearTimeout(failTimer);
                    this.connectSse();
                }
            }

            connectSse() {
                if (this.stopped) return;
                this.teardown();
                const url = (this.apiBase || '') + '/api/stream';
                try {
                    this.es = new EventSource(url);
                    this.es.onopen = () => {
                        this.mode = 'sse';
                        this.onStatus('sse', 'SSE');
                    };
                    const handle = (ev) => {
                        try { this.onEvent(JSON.parse(ev.data)); } catch (_) {}
                    };
                    this.es.addEventListener('hello', handle);
                    this.es.addEventListener('card.enqueued', handle);
                    this.es.addEventListener('card.signed', handle);
                    this.es.addEventListener('card.rejected', handle);
                    this.es.addEventListener('card.delegated', handle);
                    this.es.onmessage = handle;
                    this.es.onerror = () => {
                        if (this.stopped) return;
                        try { this.es.close(); } catch (_) {}
                        this.es = null;
                        this.startPoll();
                    };
                } catch (_) {
                    this.startPoll();
                }
            }

            startPoll() {
                if (this.stopped) return;
                this.teardown();
                this.mode = 'poll';
                this.onStatus('poll', 'POLL');
                this.pollTimer = setInterval(() => this.onEvent({ type: 'poll' }), 4000);
            }
        }

        class AIAQueueApp {
            constructor() {
                this.cards = [];
                this.selectedId = null;
                this.isMobileInspectorOpen = false;
                this.busy = false;
                this.simulation = localStorage.getItem('aia_sim_mode') === '1';
                this.lastReceipt = null;
                this.receiptByCard = new Map();
                this.bridge = null;
                this.init();
            }

            init() {
                window.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && this.selectedId && !this.busy) {
                        const t = e.target;
                        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
                        e.preventDefault();
                        this.signSelected();
                    }
                    if (e.key === 'Escape' && window.innerWidth < 768) {
                        this.closeMobileInspector();
                    }
                });
                this.applySimUi();
                if (this.simulation) {
                    this.bootSimulation(true);
                } else {
                    this.connectLive();
                }
            }

            applySimUi() {
                document.getElementById('sim-label').textContent = this.simulation ? 'ON' : 'OFF';
                const btn = document.getElementById('btn-sim-toggle');
                btn.classList.toggle('border-amber-500/50', this.simulation);
                btn.classList.toggle('text-amber-300', this.simulation);
                btn.classList.toggle('bg-amber-500/10', this.simulation);
            }

            setTelemetry({ link, linkLabel, vault, key, ledger, footer, online }) {
                const dot = document.getElementById('node-dot');
                dot.className = 'w-2.5 h-2.5 rounded-full shrink-0 ' + (online ? 'bg-emerald-500 animate-pulse' : (this.simulation ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'));
                document.getElementById('link-status').className = online ? 'text-emerald-400' : (this.simulation ? 'text-amber-300' : 'text-rose-400');
                document.getElementById('link-status').textContent = linkLabel || link || '—';
                document.getElementById('mobile-link').textContent = 'LINK: ' + (linkLabel || link || '—');
                document.getElementById('vault-status').className = online || this.simulation ? 'text-emerald-400' : 'text-rose-400';
                document.getElementById('vault-status').textContent = vault || '—';
                if (key) document.getElementById('key-status').textContent = key;
                if (ledger) {
                    document.getElementById('ledger-hash').textContent = ledger;
                    document.getElementById('ledger-hash-mobile').textContent = ledger;
                }
                if (footer) document.getElementById('footer-status').textContent = footer;
            }

            toast(msg) {
                const el = document.createElement('div');
                el.className = 'toast fade-up';
                el.textContent = msg;
                document.body.appendChild(el);
                setTimeout(() => el.remove(), 2800);
            }

            async api(path, opts = {}) {
                const res = await fetch(API + path, {
                    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
                    ...opts,
                });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(body.error || res.statusText || 'request failed');
                return body;
            }

            toggleSimulation() {
                this.simulation = !this.simulation;
                localStorage.setItem('aia_sim_mode', this.simulation ? '1' : '0');
                this.applySimUi();
                if (this.bridge) { this.bridge.stop(); this.bridge = null; }
                if (this.simulation) {
                    this.bootSimulation(false);
                    this.toast('Simulation mode ON — offline seed queue');
                } else {
                    this.cards = [];
                    this.selectedId = null;
                    this.connectLive();
                    this.toast('Simulation OFF — connecting to daemon');
                }
            }

            bootSimulation(fresh) {
                this.setTelemetry({
                    online: false,
                    linkLabel: 'SIM',
                    vault: 'LOCAL SIM (AES mock)',
                    key: 'sim-ed25519',
                    ledger: shortHash('sim-tip'),
                    footer: 'OFFLINE SIMULATION ACTIVE',
                });
                if (fresh || this.cards.length === 0) {
                    this.cards = SEED_PAYLOADS.map((payload, i) => ({
                        cardId: 'sim-card-' + (i + 1),
                        status: 'pending',
                        payload: { ...payload },
                    })).sort(compareRiskThenFifo);
                    this.selectedId = this.cards[0]?.cardId || null;
                }
                this.render();
            }

            connectLive() {
                this.setTelemetry({
                    online: false,
                    linkLabel: 'CONNECTING',
                    vault: 'PROBING',
                    footer: 'CONNECTING TO DAEMON…',
                });
                this.bridge = new RealtimeBridge(
                    API,
                    (ev) => this.onRealtime(ev),
                    (mode, label) => {
                        this.setTelemetry({
                            online: mode === 'ws' || mode === 'sse' || mode === 'poll',
                            linkLabel: label,
                            vault: mode === 'poll' ? 'POLL SYNC' : 'SECURE (AES-256)',
                            footer: mode === 'ws' ? 'WS + LOCAL VAULT ACTIVE'
                                : mode === 'sse' ? 'SSE + LOCAL VAULT ACTIVE'
                                : mode === 'poll' ? 'POLL FALLBACK ACTIVE'
                                : 'RUNTIME OFFLINE',
                        });
                        if (mode === 'ws' || mode === 'sse' || mode === 'poll') this.refresh(true);
                    },
                );
                this.bridge.start();
                this.refresh(true).catch(() => {
                    this.setTelemetry({
                        online: false,
                        linkLabel: 'OFFLINE',
                        vault: 'UNREACHABLE',
                        footer: 'RUNTIME OFFLINE — enable SIM',
                    });
                    this.toast('Runtime offline — toggle SIM or start daemon');
                    this.render();
                });
            }

            async onRealtime(ev) {
                if (!ev || this.simulation) return;
                if (ev.type === 'hello') {
                    if (ev.ledgerTip) this.setTelemetry({ online: true, ledger: ev.ledgerTip, key: ev.publicKey || undefined });
                    await this.refresh(false);
                    return;
                }
                if (ev.type === 'poll' || ev.type?.startsWith('card.')) {
                    if (ev.ledgerTip) {
                        document.getElementById('ledger-hash').textContent = ev.ledgerTip;
                        document.getElementById('ledger-hash-mobile').textContent = ev.ledgerTip;
                    }
                    if (ev.type === 'card.signed' && ev.cardId) {
                        this.showReceipt({
                            signature: ev.signature,
                            payloadHash: ev.payloadHash,
                            ledgerTip: ev.ledgerTip,
                            provenanceId: ev.provenanceId,
                            signedAt: ev.at || Date.now(),
                            verified: true,
                        }, ev.cardId);
                    }
                    await this.refresh(false);
                }
            }

            async refresh(seedIfEmpty) {
                if (this.simulation) {
                    this.render();
                    return;
                }
                const [health, queue] = await Promise.all([
                    this.api('/health'),
                    this.api('/queue?status=pending'),
                ]);
                this.setTelemetry({
                    online: true,
                    linkLabel: this.linkLabelFromBridge(),
                    vault: 'SECURE (AES-256)',
                    key: health.publicKey || '—',
                    ledger: health.ledgerTip || queue.ledgerTip || '—',
                    footer: health.dryRun ? 'GHL + LOCAL VAULT ACTIVE (DRY-RUN)' : 'GHL + LOCAL VAULT ACTIVE',
                });

                this.cards = (queue.cards || []).slice().sort(compareRiskThenFifo);

                if (seedIfEmpty && this.cards.length === 0) {
                    for (const payload of SEED_PAYLOADS) {
                        await this.api('/queue', { method: 'POST', body: JSON.stringify({ payload }) });
                    }
                    return this.refresh(false);
                }

                if (!this.selectedId || !this.cards.find((c) => c.cardId === this.selectedId)) {
                    this.selectedId = this.cards[0]?.cardId || null;
                }
                this.render();
            }

            async simulateInboundWebhook() {
                if (this.busy) return;
                this.busy = true;
                try {
                    const sample = SIM_TEMPLATES[Math.floor(Math.random() * SIM_TEMPLATES.length)];
                    let cardId;

                    if (this.simulation) {
                        cardId = 'sim-' + Date.now().toString(36);
                        this.cards.push({
                            cardId,
                            status: 'pending',
                            payload: {
                                agentId: 'agent_' + Math.random().toString(36).slice(2, 8),
                                packName: sample.name,
                                actionType: sample.type,
                                riskLevel: sample.risk,
                                targetEndpoint: sample.endpoint,
                                summary: sample.desc,
                                diffData: {
                                    before: { executionStatus: 'paused_in_sandbox', auditLocked: true },
                                    after: { executionStatus: 'authorized_dispatch', signaturePending: true },
                                },
                                resourceCost: { amount: (Math.random() * 0.04).toFixed(3), token: 'ETH' },
                                source: sample.via === 'ghl' ? 'ghl_webhook' : 'sandbox',
                                timestamp: Date.now(),
                            },
                        });
                        this.cards.sort(compareRiskThenFifo);
                        document.getElementById('ledger-hash').textContent = shortHash(cardId);
                        document.getElementById('ledger-hash-mobile').textContent = shortHash(cardId);
                    } else if (sample.via === 'ghl') {
                        const contactId = 'sim-' + Math.random().toString(36).slice(2, 8);
                        const queued = await this.api('/webhook/ghl', {
                            method: 'POST',
                            body: JSON.stringify({
                                type: sample.type.includes('SMS') ? 'ContactCreate' : 'OpportunityStageUpdate',
                                packName: sample.name,
                                actionType: sample.type,
                                summary: sample.desc,
                                contactId,
                                contact: { id: contactId, tags: ['inbound'], status: 'open' },
                                locationId: 'loc-desk-01',
                                suggestedAction: {
                                    method: sample.type.includes('SMS') ? 'POST' : 'PUT',
                                    endpoint: sample.endpoint.replace('https://services.leadconnectorhq.com', ''),
                                    body: { source: 'desk-terminal-sim' },
                                },
                            }),
                        });
                        cardId = queued.cardId;
                        await this.refresh(false);
                    } else {
                        const created = await this.api('/queue', {
                            method: 'POST',
                            body: JSON.stringify({
                                payload: {
                                    agentId: 'agent_' + Math.random().toString(36).substring(2, 8),
                                    packName: sample.name,
                                    actionType: sample.type,
                                    riskLevel: sample.risk,
                                    targetEndpoint: sample.endpoint,
                                    summary: sample.desc,
                                    diffData: {
                                        before: { executionStatus: 'paused_in_sandbox', auditLocked: true },
                                        after: { executionStatus: 'authorized_dispatch', signaturePending: true },
                                    },
                                    resourceCost: { amount: (Math.random() * 0.04).toFixed(3), token: 'ETH' },
                                    source: 'sandbox',
                                    timestamp: Date.now(),
                                },
                            }),
                        });
                        cardId = created.card.cardId;
                        await this.refresh(false);
                    }

                    this.selectedId = cardId;
                    if (window.innerWidth < 768) this.openMobileInspector();
                    this.render();
                    this.toast('Queued ' + String(cardId).slice(0, 18) + '…');
                } catch (err) {
                    this.toast(err.message || 'Simulate failed');
                } finally {
                    this.busy = false;
                }
            }

            selectCard(id) {
                this.selectedId = id;
                this.lastReceipt = this.receiptByCard.get(id) || null;
                if (window.innerWidth < 768) this.openMobileInspector();
                this.render();
            }

            openMobileInspector() {
                this.isMobileInspectorOpen = true;
                const wrapper = document.getElementById('inspector-wrapper');
                wrapper.classList.remove('translate-x-full');
                wrapper.classList.add('translate-x-0');
            }

            closeMobileInspector() {
                this.isMobileInspectorOpen = false;
                const wrapper = document.getElementById('inspector-wrapper');
                wrapper.classList.remove('translate-x-0');
                wrapper.classList.add('translate-x-full');
            }

            showReceipt(receipt, cardId) {
                this.lastReceipt = receipt;
                const id = cardId || this.selectedId;
                if (id) this.receiptByCard.set(id, receipt);
                const el = document.getElementById('audit-receipt');
                const showInline = this.selectedId === id && this.cards.some((c) => c.cardId === id);
                if (showInline) {
                    el.classList.remove('hidden');
                    el.classList.remove('receipt-pop');
                    void el.offsetWidth;
                    el.classList.add('receipt-pop');
                    document.getElementById('receipt-sig').textContent = receipt.signature || '—';
                    document.getElementById('receipt-hash').textContent = receipt.payloadHash || '—';
                    document.getElementById('receipt-ledger').textContent = receipt.ledgerTip || '—';
                    document.getElementById('receipt-prov').textContent = receipt.provenanceId ?? '—';
                    document.getElementById('receipt-time').textContent = new Date(receipt.signedAt || Date.now()).toLocaleString();
                    document.getElementById('sig-badge').classList.remove('hidden');
                }
                const strip = document.getElementById('last-audit-strip');
                const hashEl = document.getElementById('last-audit-hash');
                if (strip && hashEl) {
                    strip.classList.remove('hidden');
                    hashEl.textContent = (receipt.payloadHash || receipt.signature || '—').slice(0, 28) + '… · ' + new Date(receipt.signedAt || Date.now()).toLocaleTimeString();
                }
                if (receipt.ledgerTip) {
                    document.getElementById('ledger-hash').textContent = receipt.ledgerTip;
                    document.getElementById('ledger-hash-mobile').textContent = receipt.ledgerTip;
                }
            }

            linkLabelFromBridge() {
                const mode = this.bridge?.mode;
                if (mode === 'ws') return 'WS';
                if (mode === 'sse') return 'SSE';
                if (mode === 'poll') return 'POLL';
                if (this.simulation) return 'SIM';
                return document.getElementById('link-status').textContent || 'LIVE';
            }

            async signSelected() {
                if (!this.selectedId || this.busy) return;
                const cardId = this.selectedId;
                const card = this.cards.find((c) => c.cardId === cardId);
                if (!card) return;
                this.busy = true;
                try {
                    let result;
                    if (this.simulation) {
                        const signature = mockSignature(cardId, JSON.stringify(card.payload));
                        const payloadHash = shortHash(JSON.stringify(card.payload));
                        result = {
                            signature,
                            payloadHash,
                            ledgerTip: shortHash(signature),
                            provenanceId: Math.floor(Math.random() * 900) + 100,
                            signedAt: Date.now(),
                            verified: true,
                        };
                        this.showReceipt(result, cardId);
                        this.render();
                        await new Promise((r) => setTimeout(r, 900));
                        this.cards = this.cards.filter((c) => c.cardId !== cardId);
                        this.selectedId = this.cards[0]?.cardId || null;
                    } else {
                        result = await this.api('/api/sign', {
                            method: 'POST',
                            body: JSON.stringify({ cardId }),
                        });
                        this.showReceipt(result, cardId);
                        this.render();
                        await new Promise((r) => setTimeout(r, 900));
                        await this.refresh(false);
                    }
                    if (navigator.vibrate) navigator.vibrate(40);
                    const recs = result.recommendations || [];
                    const recNote = recs.length
                        ? ` · +${recs.length} next-action card${recs.length === 1 ? '' : 's'} (pending YES)`
                        : '';
                    this.toast(
                        'Signed · ledger #' + result.provenanceId
                        + (result.dispatch?.dryRun ? ' · dry-run' : '')
                        + recNote,
                    );
                    if (window.innerWidth < 768 && !this.selectedId) this.closeMobileInspector();
                    this.render();
                } catch (err) {
                    this.toast(err.message || 'Authorize failed');
                } finally {
                    this.busy = false;
                }
            }

            async rejectSelected() {
                if (!this.selectedId || this.busy) return;
                const cardId = this.selectedId;
                this.busy = true;
                try {
                    if (this.simulation) {
                        this.cards = this.cards.filter((c) => c.cardId !== cardId);
                        this.selectedId = this.cards[0]?.cardId || null;
                    } else {
                        await this.api('/queue/' + encodeURIComponent(cardId) + '/reject', { method: 'POST' });
                        await this.refresh(false);
                    }
                    if (window.innerWidth < 768 && !this.selectedId) this.closeMobileInspector();
                    this.render();
                } catch (err) {
                    this.toast(err.message || 'Reject failed');
                } finally {
                    this.busy = false;
                }
            }

            async delegateSelected() {
                if (!this.selectedId || this.busy) return;
                const cardId = this.selectedId;
                this.busy = true;
                try {
                    if (this.simulation) {
                        this.cards = this.cards.filter((c) => c.cardId !== cardId);
                        this.selectedId = this.cards[0]?.cardId || null;
                        this.toast('Delegated (sim) ' + String(cardId).slice(0, 18) + '…');
                    } else {
                        await this.api('/queue/' + encodeURIComponent(cardId) + '/delegate', { method: 'POST' });
                        this.toast('Delegated ' + String(cardId).slice(0, 18) + '…');
                        await this.refresh(false);
                    }
                    if (window.innerWidth < 768 && !this.selectedId) this.closeMobileInspector();
                    this.render();
                } catch (err) {
                    this.toast(err.message || 'Delegate failed');
                } finally {
                    this.busy = false;
                }
            }

            render() {
                document.getElementById('queue-count').textContent = this.cards.length;

                const listEl = document.getElementById('queue-list');
                if (this.cards.length === 0) {
                    listEl.innerHTML = `
                        <div class="text-center py-16 text-slate-500 font-mono text-xs fade-up">
                            <i data-lucide="check-circle" class="w-8 h-8 mx-auto mb-2 text-emerald-500/50"></i>
                            QUEUE CLEAR<br><span class="text-[10px] text-slate-600">All GHL & agent swarms synced</span>
                        </div>
                    `;
                } else {
                    listEl.innerHTML = this.cards.map((c) => {
                        const isSelected = c.cardId === this.selectedId;
                        const riskColors = {
                            critical: 'bg-rose-500/10 text-rose-400 border-rose-500/30 critical-glow',
                            high: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                            medium: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
                            low: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }[c.payload.riskLevel] || 'bg-desk-700 text-slate-300 border-desk-600';

                        const isRec = c.payload.source === 'recommendation' || !!c.payload.recommendationKind;
                        const srcChip = isRec
                            ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border border-teal-500/40 bg-teal-500/10 text-teal-300">REC</span>'
                            : '';
                        return `
                            <div onclick="app.selectCard('${escapeHtml(c.cardId)}')" class="p-3.5 rounded-xl border transition cursor-pointer font-mono text-xs fade-up ${isSelected && window.innerWidth >= 768 ? 'bg-desk-700/80 border-indigo-500/50 shadow-md shadow-indigo-950/50' : 'bg-desk-800/40 border-desk-700/60 hover:bg-desk-700/40 hover:border-desk-600'}">
                                <div class="flex items-center justify-between mb-2 gap-2">
                                    <div class="flex items-center gap-1.5 min-w-0">
                                        <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${riskColors}">${escapeHtml(c.payload.riskLevel)}</span>
                                        ${srcChip}
                                    </div>
                                    <span class="text-[10px] text-slate-500 shrink-0">${new Date(c.payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                </div>
                                <div class="font-semibold text-slate-200 truncate mb-1">${escapeHtml(c.payload.packName)}</div>
                                <div class="text-[11px] text-slate-400 truncate">${escapeHtml(c.payload.actionType)}${isRec && c.payload.recommendationKind ? ' · ' + escapeHtml(c.payload.recommendationKind) : ''}</div>
                            </div>
                        `;
                    }).join('');
                }

                const emptyStateEl = document.getElementById('empty-state');
                const inspectorEl = document.getElementById('inspector-content');
                const activeCard = this.cards.find((c) => c.cardId === this.selectedId);

                if (!activeCard) {
                    emptyStateEl.classList.remove('hidden');
                    emptyStateEl.classList.add('md:flex');
                    inspectorEl.classList.add('hidden');
                } else {
                    emptyStateEl.classList.add('hidden');
                    emptyStateEl.classList.remove('md:flex');
                    inspectorEl.classList.remove('hidden');

                    document.getElementById('mobile-card-id').textContent = activeCard.cardId;

                    const badgeEl = document.getElementById('card-risk-badge');
                    badgeEl.textContent = activeCard.payload.riskLevel + ' risk';
                    badgeEl.className = 'font-mono text-[10px] px-2.5 py-0.5 rounded font-bold uppercase ' + ({
                        critical: 'bg-rose-500/20 text-rose-300 border border-rose-500/40 critical-glow',
                        high: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
                        medium: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
                        low: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }[activeCard.payload.riskLevel] || 'bg-desk-700 text-slate-300');

                    document.getElementById('card-pack-name').textContent = activeCard.payload.packName;
                    document.getElementById('card-timestamp').textContent = new Date(activeCard.payload.timestamp).toLocaleString();
                    document.getElementById('card-title').textContent = activeCard.payload.actionType;
                    const cost = activeCard.payload.resourceCost;
                    document.getElementById('card-cost').textContent = cost ? `${cost.amount} ${cost.token}` : '—';
                    document.getElementById('card-endpoint').textContent = activeCard.payload.targetEndpoint;
                    document.getElementById('card-agent-id').textContent = activeCard.payload.agentId;
                    document.getElementById('card-summary').textContent = activeCard.payload.summary;
                    document.getElementById('meta-prompt').textContent = synthesizeMetaPrompt(activeCard);
                    document.getElementById('diff-before').textContent = JSON.stringify(activeCard.payload.diffData?.before || {}, null, 2);
                    document.getElementById('diff-after').textContent = JSON.stringify(activeCard.payload.diffData?.after || {}, null, 2);

                    const receipt = this.receiptByCard.get(activeCard.cardId) || null;
                    const receiptEl = document.getElementById('audit-receipt');
                    if (receipt) {
                        receiptEl.classList.remove('hidden');
                        document.getElementById('receipt-sig').textContent = receipt.signature || '—';
                        document.getElementById('receipt-hash').textContent = receipt.payloadHash || '—';
                        document.getElementById('receipt-ledger').textContent = receipt.ledgerTip || '—';
                        document.getElementById('receipt-prov').textContent = receipt.provenanceId ?? '—';
                        document.getElementById('receipt-time').textContent = new Date(receipt.signedAt || Date.now()).toLocaleString();
                        document.getElementById('sig-badge').classList.remove('hidden');
                    } else {
                        receiptEl.classList.add('hidden');
                        document.getElementById('sig-badge').classList.add('hidden');
                    }
                }

                if (window.lucide) lucide.createIcons();
            }
        }

        window.app = new AIAQueueApp();
    })();
