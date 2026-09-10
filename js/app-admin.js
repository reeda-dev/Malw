// =============================================
        // Firebase + Firestore
        // =============================================
        import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
        import {
            getFirestore,
            doc,
            getDoc,
            setDoc,
            onSnapshot,
            collection,
            updateDoc
        } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyD5l7NOkDlE9bnG81cRB0bGwhBc44JDabw",
            authDomain: "egg-store-68ee4.firebaseapp.com",
            projectId: "egg-store-68ee4",
            storageBucket: "egg-store-68ee4.firebasestorage.app",
            messagingSenderId: "140927588957",
            appId: "1:140927588957:web:66c40b2aab6152d4db8bb4"
        };

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const auth = getAuth(app);
        const DB_REF = doc(firestore, "egg_store", "main");

        // =========================
        // قاعدة البيانات الافتراضية
        // =========================
        const defaultDB = {
            stock: 0,
            prices: {
                large: 150,
                medium: 145,
                small: 140,
                red_large: 160,
                white_large: 155,
                bashayer: 130
            },
            customers: [],
            suppliers: [],
            supplierPayments: [],
            sales: [],
            returns: [],
            orders: [],
            wastage: [],
            inventoryMovements: [],
            inventoryResetAt: 0,
            stockAtReset: 0,
            purchaseValueAtReset: 0,
            periodCustomerDebt: 0
        };

        let db = normalizeDB(defaultDB);
        let databaseReady = false;
        let adminReady = false;
        let customersDebtPeriod = 'all';
        let statementPeriod = 'all';
        let supplierStatementPeriod = 'all';

        // حماية عامة من تكرار أي عملية حفظ أثناء بطء الإنترنت.
        // كل العمليات التي تعدّل البيانات تمر من هنا قبل تنفيذ التغيير.
        let mutationInProgress = false;

        function beginMutation(trigger = null) {
            if (mutationInProgress) {
                return null;
            }

            mutationInProgress = true;
            const snapshot = structuredClone(db);

            document.querySelectorAll('form button[type="submit"], [data-mutation-action], .inventory-reset-btn').forEach(btn => {
                btn.disabled = true;
                btn.dataset.mutationLocked = '1';
            });

            if (trigger && trigger.tagName === 'BUTTON') {
                trigger.dataset.mutationOriginalText = trigger.textContent;
                trigger.textContent = 'جاري الحفظ...';
            }

            return snapshot;
        }

        function endMutation(success, snapshot = null, trigger = null) {
            if (!success && snapshot) {
                // لو الحفظ فشل، نرجع كل التعديلات المحلية التي تمت قبل الحفظ.
                db = normalizeDB(snapshot);
                updateUI();
            }

            document.querySelectorAll('[data-mutation-locked="1"]').forEach(btn => {
                btn.disabled = false;
                delete btn.dataset.mutationLocked;
            });

            if (trigger && trigger.tagName === 'BUTTON' && trigger.dataset.mutationOriginalText) {
                trigger.textContent = trigger.dataset.mutationOriginalText;
                delete trigger.dataset.mutationOriginalText;
            }

            mutationInProgress = false;
        }

        // أرقام تسلسلية ثابتة للأسماء (الزبائن / الموردين / الطلبات).
        // الأرقام القديمة تُستكمل تلقائيًا، وأي إضافة جديدة تأخذ الرقم التالي.
        function normalizeSerialList(list) {
            const items = Array.isArray(list) ? list : [];
            const used = new Set();
            let maxSerial = 0;

            // نحافظ على الأرقام الصحيحة والفريدة الموجودة بالفعل.
            items.forEach(item => {
                const n = Number(item?.serial);
                if (Number.isInteger(n) && n > 0 && !used.has(n)) {
                    used.add(n);
                    maxSerial = Math.max(maxSerial, n);
                }
            });

            // أي عنصر قديم بدون رقم (أو برقم مكرر) يأخذ رقمًا جديدًا.
            return items.map(item => {
                const n = Number(item?.serial);
                if (Number.isInteger(n) && n > 0 && !used.has(`assigned:${n}`)) {
                    used.add(`assigned:${n}`);
                    return { ...item, serial: n };
                }
                maxSerial += 1;
                while (used.has(maxSerial) || used.has(`assigned:${maxSerial}`)) maxSerial += 1;
                used.add(maxSerial);
                used.add(`assigned:${maxSerial}`);
                return { ...item, serial: maxSerial };
            });
        }

        function getNextSerial(list) {
            return (Array.isArray(list) ? list : []).reduce((max, item) => {
                const n = Number(item?.serial);
                return Number.isInteger(n) && n > max ? n : max;
            }, 0) + 1;
        }

        function normalizeDB(data) {
            return {
                ...structuredClone(defaultDB),
                ...(data || {}),
                prices: {
                    ...defaultDB.prices,
                    ...((data && data.prices) || {})
                },
                customers: normalizeSerialList(Array.isArray(data?.customers) ? data.customers : []).map(c => ({
                    ...c,
                    balance: Number(c.balance || 0),
                    creditBalance: Number(c.creditBalance || 0)
                })),
                supplierPayments: Array.isArray(data?.supplierPayments) ? data.supplierPayments : [],
                suppliers: normalizeSerialList(Array.isArray(data?.suppliers) ? data.suppliers : []).map(s => ({
                    ...s,
                    id: Number(s.id || Date.now()),
                    name: String(s.name || ''),
                    phone: String(s.phone || ''),
                    notes: String(s.notes || ''),
                    balance: Number(s.balance || 0)
                })),
                sales: Array.isArray(data?.sales) ? data.sales : [],
                returns: Array.isArray(data?.returns) ? data.returns : [],
                orders: normalizeSerialList(Array.isArray(data?.orders) ? data.orders : []),
                wastage: Array.isArray(data?.wastage) ? data.wastage : [],
                inventoryMovements: Array.isArray(data?.inventoryMovements) ? data.inventoryMovements : [],
                inventoryResetAt: Number(data?.inventoryResetAt || 0),
                stockAtReset: Number(data?.stockAtReset || 0),
                purchaseValueAtReset: Number(data?.purchaseValueAtReset || 0),
                periodCustomerDebt: Number(data?.periodCustomerDebt || 0)
            };
        }

        // =========================
        // التاريخ + اليوم
        // =========================
        const WEEK_DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        function getDateObject(dateValue, timestamp) {
            if (timestamp) {
                const d = new Date(Number(timestamp));
                if (!Number.isNaN(d.getTime())) return d;
            }
            if (dateValue instanceof Date) return dateValue;
            const raw = String(dateValue || '').trim();
            const normalizedRaw = raw.replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
            const match = normalizedRaw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            if (match) {
                const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
                if (!Number.isNaN(d.getTime())) return d;
            }
            return new Date();
        }

        function formatDateWithDay(dateValue, timestamp) {
            const d = getDateObject(dateValue, timestamp);
            const dateText = dateValue || d.toLocaleDateString('ar-EG');
            const dayText = WEEK_DAYS_AR[d.getDay()];
            return `<div class="date-with-day"><span class="date-main">${escapeHTML(String(dateText))}</span><span class="date-day">${dayText}</span></div>`;
        }

        function nowMeta() {
            const timestamp = Date.now();
            return { date: new Date(timestamp).toLocaleDateString('ar-EG'), timestamp };
        }

        function parseDateInputStart(value) {
            if (!value) return 0;
            // value = YYYY-MM-DD → بداية اليوم المحلي
            const parts = String(value).split('-').map(Number);
            if (parts.length !== 3 || parts.some(n => !n && n !== 0)) return 0;
            const d = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
            const t = d.getTime();
            return Number.isNaN(t) ? 0 : t;
        }

        function getCustomersDebtStart() {
            const input = document.getElementById('customersDebtFromDate');
            return parseDateInputStart(input?.value || '');
        }

        function getStatementStart() {
            const input = document.getElementById('statementFromDate');
            return parseDateInputStart(input?.value || '');
        }

        function getSupplierStatementStart() {
            const input = document.getElementById('supplierStatementFromDate');
            return parseDateInputStart(input?.value || '');
        }

        function clearCustomersDebtDate() {
            const input = document.getElementById('customersDebtFromDate');
            if (input) input.value = '';
            updatePeriodCustomerDebtTotal();
        }

        function onStatementDateChange() {
            if (selectedStatementCustomerId) renderStatement();
        }

        function clearStatementDate() {
            const input = document.getElementById('statementFromDate');
            if (input) input.value = '';
            if (selectedStatementCustomerId) renderStatement();
        }

        function onSupplierStatementDateChange() {
            renderSupplierStatement();
        }

        function clearSupplierStatementDate() {
            const input = document.getElementById('supplierStatementFromDate');
            if (input) input.value = '';
            renderSupplierStatement();
        }

        function getInventoryStart() {
            const input = document.getElementById('inventoryFromDate');
            return parseDateInputStart(input?.value || '');
        }

        function onInventoryDateChange() {
            updateUI();
        }

        function clearInventoryDate() {
            const input = document.getElementById('inventoryFromDate');
            if (input) input.value = '';
            updateUI();
        }

        function getSalePaidAtSale(s) {
            if (!s) return 0;
            if (s.paidAtSale != null && s.paidAtSale !== '') return Math.max(0, Number(s.paidAtSale) || 0);
            if (s.initialPaid != null && s.initialPaid !== '') return Math.max(0, Number(s.initialPaid) || 0);
            // فواتير قديمة: اعتبر paid وقت البيع
            return Math.max(0, Number(s.paid || 0) || 0);
        }

        // دين الزبون من تاريخ معيّن لحد الآن = مبيعات الفترة − تحصيلات الفترة − تخفيض مرتجعات الفترة
        function getCustomerPeriodDebt(customerId, start) {
            if (!start) {
                const c = (db.customers || []).find(x => Number(x.id) === Number(customerId));
                return Math.max(0, Number(c?.balance || 0));
            }
            let debt = 0;
            (db.sales || []).forEach(s => {
                if (Number(s.customerId) !== Number(customerId)) return;
                const ts = Number(s.timestamp || s.id || 0);
                if (ts < start) return;
                const t = s.type || 'sale';
                if (t === 'sale') {
                    const paidAtSale = getSalePaidAtSale(s);
                    debt += Math.max(0, Number(s.total || 0) - paidAtSale - Number(s.creditUsed || 0));
                } else if (t === 'payment') {
                    debt -= Math.max(0, Number(s.paid || 0));
                }
            });
            (db.returns || []).forEach(r => {
                if (Number(r.customerId) !== Number(customerId)) return;
                const ts = Number(r.timestamp || r.id || 0);
                if (ts < start) return;
                debt -= Math.max(0, Number(r.debtReduction || 0));
            });
            return Math.max(0, Math.round(debt * 100) / 100);
        }

        function updatePeriodCustomerDebtTotal() {
            const el = document.getElementById('periodCustomerDebtTotal');
            if (!el) return;
            const start = getCustomersDebtStart();
            let total = 0;
            if (!start) {
                total = (db.customers || []).reduce((s, c) => s + Math.max(0, Number(c.balance || 0)), 0);
            } else {
                (db.customers || []).forEach(c => {
                    total += getCustomerPeriodDebt(c.id, start);
                });
            }
            el.innerText = `${Math.round(total * 100) / 100} ج.م`;
            // حدّث عمود الدين جنب كل زبون حسب الفترة
            filterCustomers();
        }

        function getInvoiceRemaining(s) {
            if (!s) return 0;
            // الحساب من المدفوع والمرتجعات (مش من حقل remaining القديم لوحده)
            const base = Math.max(0, Number(s.total || 0) - Number(s.paid || 0) - Number(s.creditUsed || 0));
            const returnedVal = (db.returns || [])
                .filter(r => Number(r.saleId) === Number(s.id))
                .reduce((sum, r) => sum + Number(r.total || 0), 0);
            return Math.max(0, base - returnedVal);
        }



        function addInventoryMovement(payload = {}) {
            const {
                type,
                trays = 0,
                customerId = null,
                customerName = '',
                price = 0,
                total = 0,
                paid = 0,
                remaining = 0,
                reason = '',
                source = '',
                supplierId = null,
                supplierName = '',
                saleId = null
            } = payload;
            db.inventoryMovements.push({
                id: Date.now() + Math.floor(Math.random() * 1000),
                type,
                trays: Number(trays) || 0,
                customerId,
                customerName,
                saleId: saleId != null ? Number(saleId) : null,
                price: Number(price) || 0,
                total: Number(total) || 0,
                paid: Number(paid) || 0,
                remaining: Number(remaining) || 0,
                reason,
                source,
                supplierId: supplierId != null ? Number(supplierId) : null,
                supplierName: supplierName || '',
                ...nowMeta()
            });
        }

        // قراءة البيانات من Firestore عند بداية التشغيل
        async function loadDB() {
            if (!auth.currentUser) return;
            try {
                const snapshot = await getDoc(DB_REF);

                if (!snapshot.exists()) {
                    db = structuredClone(defaultDB);
                    await setDoc(DB_REF, db);
                } else {
                    db = normalizeDB(snapshot.data());
                }

                databaseReady = true;
                updateUI();
                console.log("Firebase database loaded successfully");
            } catch (error) {
                console.error("Firebase load error:", error);
                alert("تعذر الاتصال بقاعدة البيانات. تأكد من Firestore Rules واتصال الإنترنت.\n\n" + (error?.code || error?.message || "Unknown error"));
            }
        }

        // حفظ البيانات في Firestore بدل localStorage
        async function saveDB(previousState = null) {
            if (!databaseReady || !auth.currentUser) {
                alert("لم يتم تسجيل دخول الإدارة أو لم تجهز قاعدة البيانات بعد.");
                return false;
            }

            try {
                await setDoc(DB_REF, db);
                updateUI();
                return true;
            } catch (error) {
                console.error("Firebase save error:", error);
                if (previousState) {
                    db = normalizeDB(previousState);
                    updateUI();
                }
                alert("فشل حفظ البيانات في Firebase.\n\n" + (error?.code || error?.message || "Unknown error") + "\n\nتأكد من Firestore Rules وأنها تسمح بالقراءة والكتابة.");
                return false;
            }
        }

        // =========================
        // جلسة الإدارة + المستمعون الآمنون
        // =========================
        let unsubscribeMain = null;
        let unsubscribeOrders = null;

        function startAdminListeners() {
            if (unsubscribeMain) unsubscribeMain();
            if (unsubscribeOrders) unsubscribeOrders();

            unsubscribeMain = onSnapshot(DB_REF, (snapshot) => {
                if (snapshot.exists()) {
                    db = normalizeDB(snapshot.data());
                } else {
                    db = normalizeDB(defaultDB);
                    setDoc(DB_REF, db).catch(console.error);
                }
                databaseReady = true;
                updateUI();
            }, (error) => {
                console.error("Firebase realtime listener error:", error);
                databaseReady = false;
                alert("تعذر الاتصال ببيانات الإدارة. تأكد من Firestore Rules.\n\n" + (error?.code || error?.message || "Unknown error"));
            });

            unsubscribeOrders = onSnapshot(collection(firestore, "online_orders"), (snapshot) => {
                db.orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                db.orders = normalizeSerialList(db.orders);
                updateOrdersTable();
            }, (error) => {
                console.error("Orders listener error:", error);
            });
        }

        async function adminLogout() {
            await signOut(auth);
            window.location.replace("login.html");
        }

        function toggleAdminMode(isAdmin) {
            if (isAdmin) document.body.classList.add('admin-mode');
            else document.body.classList.remove('admin-mode');
        }

        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('open');
        }

        function switchTab(tabId, btn) {
            document.querySelectorAll('.tab-view').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

            const tab = document.getElementById(tabId);
            if (tab) tab.classList.add('active');
            if (btn) btn.classList.add('active');

            document.getElementById('sidebar').classList.remove('open');

            if (tabId === 'statement') renderStatement();
            if (tabId === 'supplierStatement') renderSupplierStatement();
        }

        // =========================
        // أدوات مساعدة
        // =========================
        function getNumber(id) {
            return parseFloat(document.getElementById(id).value) || 0;
        }

        function escapeHTML(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // =========================
        // طلبات الزبون أونلاين
        // =========================
        function calcOnlineOrder() {
            const type = document.getElementById('orderType').value;
            const trays = getNumber('orderTrays');
            const unitPrice = Number(db.prices[type]) || 0;
            const total = trays * unitPrice;

            document.getElementById('orderTotalDisplay').innerText = total + " ج.م";
        }

        async function submitOnlineOrder(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const type = document.getElementById('orderType').value;
            const trays = parseInt(document.getElementById('orderTrays').value, 10);

            if (!trays || trays < 1) {
                alert('أدخل عدد أطباق صحيح!');
                return;
            }

            const unitPrice = Number(db.prices[type]) || 0;

            const typeNames = {
                large: 'بيض كبير',
                medium: 'بيض وسط',
                small: 'بيض صغير',
                red_large: 'بيض أحمر كبير',
                white_large: 'بيض أبيض كبير',
                bashayer: 'بيض بشاير صغير بلدي'
            };

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.orders.push({
                id: Date.now(),
                serial: getNextSerial(db.orders),
                name: document.getElementById('orderName').value.trim(),
                phone: document.getElementById('orderPhone').value.trim(),
                address: document.getElementById('orderAddress').value.trim(),
                type: type,
                typeName: typeNames[type],
                trays: trays,
                unitPrice: unitPrice,
                total: trays * unitPrice,
                status: 'pending',
                ...nowMeta()
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                calcOnlineOrder();
                alert('تم إرسال طلبك بنجاح! سنتواصل معك قريباً لتأكيد التوصيل.');
            }
        }

        // =========================
        // تحديث الأسعار
        // =========================
        async function updatePrices(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const priceKeys = ['large','medium','small','red_large','white_large','bashayer'];
            const ids = {
                large: 'setPriceLarge',
                medium: 'setPriceMedium',
                small: 'setPriceSmall',
                red_large: 'setPriceRedLarge',
                white_large: 'setPriceWhiteLarge',
                bashayer: 'setPriceBashayer'
            };
            const nextPrices = { ...db.prices };
            for (const key of priceKeys) {
                const el = document.getElementById(ids[key]);
                if (!el) continue;
                const val = getNumber(ids[key]);
                if (val <= 0) {
                    alert('يجب إدخال أسعار أكبر من صفر لكل الأنواع!');
                    return;
                }
                nextPrices[key] = val;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db = normalizeDB(db);
            db.prices = nextPrices;

            const saved = await saveDB(mutationSnapshot);
            if (saved) {
                try {
                    await setDoc(doc(firestore, "store_public", "config"), { ...nextPrices, updatedAt: Date.now() });
                } catch (publicError) {
                    console.error("Public prices sync error:", publicError);
                    alert("تم حفظ الأسعار للإدارة، لكن تعذر تحديث أسعار واجهة الزبون. تأكد من Rules.");
                }
            }
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                alert('تم تحديث أسعار البيض بنجاح!');
                calcOnlineOrder();
            }
        }

        async function markOrderComplete(orderId) {
            if (!auth.currentUser) return;
            try {
                await updateDoc(doc(firestore, "online_orders", String(orderId)), {
                    status: "completed", completedAt: Date.now()
                });
            } catch (error) {
                console.error("Order update error:", error);
                alert("تعذر تحديث حالة الطلب.\n\n" + (error?.code || error?.message || "unknown"));
            }
        }

        // =========================
        // البيع
        // =========================
        function calcSale() {
            const trays = getNumber('saleTrays');
            const price = getNumber('salePrice');
            const paid = getNumber('salePaid');

            const total = trays * price;
            const remaining = Math.max(0, total - paid);

            document.getElementById('saleTotal').innerText = total;
            document.getElementById('saleRemaining').innerText = remaining;
        }

        async function addSale(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const customerNameInput = document.getElementById('saleCustomerInput').value.trim();
            const customer = db.customers.find(c => c.name.trim() === customerNameInput);

            if (!customer) {
                alert('يرجى اختيار زبون صحيح من القائمة أولاً!');
                return;
            }

            const trays = parseInt(document.getElementById('saleTrays').value, 10);
            const price = parseFloat(document.getElementById('salePrice').value);
            const paid = parseFloat(document.getElementById('salePaid').value) || 0;

            if (!trays || trays < 1) {
                alert('أدخل عدد أطباق صحيح!');
                return;
            }

            if (!price || price <= 0) {
                alert('أدخل سعر صحيح!');
                return;
            }

            const total = trays * price;

            if (paid < 0 || paid > total) {
                alert('المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الفاتورة.');
                return;
            }

            if (db.stock < trays) {
                alert('المخزون غير كافٍ!');
                return;
            }

            const remainingBeforeCredit = total - paid;
            const creditUsed = Math.min(Number(customer.creditBalance || 0), remainingBeforeCredit);
            const remaining = remainingBeforeCredit - creditUsed;

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.stock -= trays;
            customer.creditBalance = Math.max(0, Number(customer.creditBalance || 0) - creditUsed);
            customer.balance = Number(customer.balance || 0) + remaining;

            const saleId = Date.now();
            db.sales.push({
                id: saleId,
                customerId: customer.id,
                trays,
                price,
                total,
                paid,
                paidAtSale: paid,
                creditUsed,
                remaining,
                returnedTrays: 0,
                type: 'sale',
                ...nowMeta()
            });
            if (remaining > 0) {
                db.periodCustomerDebt = Number(db.periodCustomerDebt || 0) + remaining;
            }

            addInventoryMovement({
                type: 'sale',
                trays,
                customerId: customer.id,
                customerName: customer.name,
                saleId,
                price,
                total,
                paid,
                remaining,
                reason: `بيع للزبون ${customer.name} | متبقي عليه: ${remaining} ج.م`,
                source: 'فاتورة بيع'
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                calcSale();
                alert('تم حفظ الفاتورة بنجاح!');
            }
        }

        // =========================
        // العملاء
        // =========================
        async function addCustomer(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const name = document.getElementById('custName').value.trim();
            const phone = document.getElementById('custPhone').value.trim();

            if (!name) {
                alert('أدخل اسم الزبون!');
                return;
            }

            const exists = db.customers.some(c =>
                c.name.trim().toLowerCase() === name.toLowerCase()
            );

            if (exists) {
                alert('هذا الزبون موجود بالفعل!');
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.customers.push({
                id: Date.now(),
                serial: getNextSerial(db.customers),
                name,
                phone,
                balance: 0,
                creditBalance: 0
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                alert('تم حفظ الزبون بنجاح!');
            }
        }

        // =========================
        // المزارع / الموردين
        // =========================
        async function addSupplier(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const name = document.getElementById('supplierName').value.trim();
            const phone = document.getElementById('supplierPhone').value.trim();

            if (!name) {
                alert('أدخل اسم صاحب المزرعة!');
                return;
            }

            const exists = db.suppliers.some(s =>
                String(s.name || '').trim().toLowerCase() === name.toLowerCase()
            );

            if (exists) {
                alert('هذا المورد موجود بالفعل!');
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.suppliers.push({
                id: Date.now(),
                serial: getNextSerial(db.suppliers),
                name,
                phone,
                balance: 0
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                alert('تم حفظ المورد بنجاح!');
            }
        }

        function getSupplierMatches() {
            const q = String(document.getElementById('purchaseSupplierInput')?.value || '').trim().toLowerCase();
            if (!q) return db.suppliers.slice();
            return db.suppliers.filter(s =>
                String(s.name || '').toLowerCase().includes(q) ||
                String(s.phone || '').toLowerCase().includes(q)
            );
        }

        function searchPurchaseSupplier() {
            const box = document.getElementById('purchaseSupplierResults');
            if (!box) return;

            const q = String(document.getElementById('purchaseSupplierInput')?.value || '').trim();

            // زي المرتجعات: تظهر النتائج عند الكتابة فقط
            if (!q) {
                box.style.display = 'none';
                box.innerHTML = '';
                return;
            }

            const matches = getSupplierMatches();
            box.style.display = 'block';

            if (!matches.length) {
                box.innerHTML = '<div class="search-empty">لا يوجد مورد مطابق</div>';
                return;
            }

            box.innerHTML = matches.slice(0, 20).map(s => `
                <button type="button" class="search-result-item" onclick="selectPurchaseSupplier(${s.id})">
                    <b>${escapeHTML(s.name)}</b>
                    <span>${escapeHTML(s.phone || '')}</span>
                </button>
            `).join('');
        }

        function selectPurchaseSupplier(id) {
            const supplier = db.suppliers.find(s => Number(s.id) === Number(id));
            if (!supplier) return;

            document.getElementById('purchaseSupplier').value = supplier.id;
            document.getElementById('purchaseSupplierInput').value = supplier.name;

            const box = document.getElementById('purchaseSupplierResults');
            if (box) {
                box.style.display = 'none';
                box.innerHTML = '';
            }
        }

        function filterSuppliers() {
            const q = String(document.getElementById('supplierSearch')?.value || '').trim().toLowerCase();
            const rows = db.suppliers.filter(s =>
                !q ||
                String(s.name || '').toLowerCase().includes(q) ||
                String(s.phone || '').toLowerCase().includes(q)
            );

            const table = document.getElementById('suppliersTable');
            if (!table) return;

            table.innerHTML = rows.length ? rows.map(s => {
                return `
                    <tr>
                        <td><b>${Number(s.serial || 0)}</b></td>
                        <td><b>${escapeHTML(s.name)}</b></td>
                        <td>${escapeHTML(s.phone || '-')}</td>
                        <td style="font-weight:bold">${Number(s.balance || 0)} ج.م</td>
                        <td>
                            <button type="button" data-mutation-action="1" onclick="paySupplier(${s.id})" class="btn-edit-row" style="margin-left:6px;background:#2563eb;color:#fff;border-color:#2563eb;">سداد</button>
                            <button type="button" data-mutation-action="1" onclick="editSupplier(${s.id})" class="btn-edit-row">تعديل</button>
                        </td>
                    </tr>
                `;
            }).join('') : '<tr><td colspan="5" style="text-align:center;">لا يوجد موردون مطابقون للبحث</td></tr>';
        }

        function calcPurchase() {
            const trays = getNumber('purTrays');
            const price = getNumber('purPrice');
            const paid = getNumber('purPaid') || 0;
            const total = trays * price;
            const el = document.getElementById('purchaseTotalDisplay');
            if (el) el.innerText = total;
            const rem = document.getElementById('purchaseRemainingDisplay');
            if (rem) rem.innerText = Math.max(0, total - (paid || 0));
        }

        // =========================
        // المشتريات والمخزون
        // =========================
        async function addPurchase(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const supplierId = Number(document.getElementById('purchaseSupplier').value || 0);
            const supplier = db.suppliers.find(s => Number(s.id) === supplierId);
            const trays = parseInt(document.getElementById('purTrays').value, 10);
            const price = getNumber('purPrice');
            const total = trays * price;
            let paid = getNumber('purPaid');
            if (Number.isNaN(paid) || paid < 0) paid = 0;
            if (paid > total) {
                alert('المبلغ المدفوع لا يمكن أن يكون أكبر من إجمالي الشراء.');
                return;
            }
            const remaining = Math.max(0, total - paid);

            if (!supplier) {
                alert('اختر صاحب المزرعة أولًا!');
                return;
            }

            if (!trays || trays < 1) {
                alert('أدخل عدد الأطباق بشكل صحيح!');
                return;
            }

            if (!price || price <= 0) {
                alert('لا يمكن تسجيل الشراء بدون سعر الطبق. أدخل سعرًا صحيحًا أولًا!');
                document.getElementById('purPrice')?.focus();
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.stock += trays;
            supplier.balance = Number(supplier.balance || 0) + remaining;

            addInventoryMovement({
                type: 'purchase',
                trays,
                price,
                total,
                paid,
                remaining,
                supplierId: supplier.id,
                supplierName: supplier.name,
                source: 'شراء من مزرعة',
                reason: `شراء ${trays} طبق من ${supplier.name} | دفع ${paid} | متبقي ${remaining}`
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                document.getElementById('purchaseSupplier').value = '';
                document.getElementById('purchaseSupplierInput').value = '';
                calcPurchase();
                alert(`تمت إضافة ${trays} طبق للمخزن من ${supplier.name}!\nالإجمالي: ${total} | المدفوع: ${paid} | المتبقي عليه: ${remaining}`);
            }
        }

        async function addWastage(e) {
            e.preventDefault();

            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const trays = parseInt(document.getElementById('wasteTrays').value, 10);
            const reason = document.getElementById('wasteReason').value.trim();

            if (!trays || trays < 1) {
                alert('أدخل كمية صحيحة!');
                return;
            }

            if (db.stock < trays) {
                alert('الكمية المراد خصمها أكبر من المخزون!');
                return;
            }

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            db.stock -= trays;
            addInventoryMovement({
                type: 'wastage',
                trays,
                reason,
                source: 'تالف / كسر'
            });

            db.wastage.push({
                id: Date.now(),
                trays,
                reason,
                ...nowMeta()
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                alert('تم خصم الكسر من المخزن!');
            }
        }

        // =========================
        // تحصيل الديون
        // =========================
        async function payDebt(custId) {
            const customer = db.customers.find(c => c.id === custId);
            if (!customer) return;

            const debt = Number(customer.balance || 0);
            const credit = Number(customer.creditBalance || 0);

            // حالة 1: الزبون عليه دين للمحل
            if (debt > 0) {
                const amount = parseFloat(
                    prompt(`تحصيل من الزبون\nالمستحق عليه: ${debt} ج.م\nأدخل المبلغ المحصل:`)
                );
                if (!amount || amount <= 0) return;
                if (amount > debt) {
                    alert('المبلغ المحصل أكبر من الدين المستحق.');
                    return;
                }

                const mutationSnapshot = beginMutation();
                if (!mutationSnapshot) return;

                customer.balance = debt - amount;
                db.periodCustomerDebt = Math.max(0, Number(db.periodCustomerDebt || 0) - amount);
                // خصم من متبقي حركات البيع في المخزن (الأقدم أولاً) عشان رقم الفترة يتحدث
                let leftToApply = amount;
                const saleMovs = (db.inventoryMovements || [])
                    .filter(m => m.type === 'sale' && Number(m.customerId) === Number(custId))
                    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
                for (const m of saleMovs) {
                    if (leftToApply <= 0) break;
                    let cur = Number(m.remaining);
                    if (!Number.isFinite(cur)) {
                        cur = Math.max(0, Number(m.total || 0) - Number(m.paid || 0));
                    }
                    cur = Math.max(0, cur);
                    if (cur <= 0) continue;
                    const take = Math.min(cur, leftToApply);
                    m.remaining = cur - take;
                    m.paid = Number(m.paid || 0) + take;
                    leftToApply -= take;
                }
                // خصم من متبقي فواتير البيع (حتى لو remaining مش متسجل قديمًا)
                leftToApply = amount;
                const saleInvoices = (db.sales || [])
                    .filter(s => (s.type === 'sale' || !s.type) && Number(s.customerId) === Number(custId))
                    .sort((a, b) => Number(a.timestamp || a.id || 0) - Number(b.timestamp || b.id || 0));
                for (const s of saleInvoices) {
                    if (leftToApply <= 0) break;
                    const cur = getInvoiceRemaining(s);
                    if (cur <= 0) continue;
                    const take = Math.min(cur, leftToApply);
                    s.paid = Number(s.paid || 0) + take;
                    s.remaining = getInvoiceRemaining(s); // بعد زيادة المدفوع
                    leftToApply -= take;
                }
                // لو لسه في مبلغ (فواتير قديمة بدون total)، نخصم من أي فاتورة عليها متبقي منطقي
                if (leftToApply > 0) {
                    for (const s of saleInvoices) {
                        if (leftToApply <= 0) break;
                        // لا شيء إضافي — getInvoiceRemaining يغطي total/paid
                    }
                }
                db.sales.push({
                    id: Date.now(),
                    customerId: custId,
                    trays: 0,
                    price: 0,
                    total: debt,
                    paid: amount,
                    remaining: customer.balance,
                    originalBalance: debt,
                    remainingAfterPayment: customer.balance,
                    type: 'payment',
                    ...nowMeta()
                });

                const saved = await saveDB(mutationSnapshot);
                endMutation(saved, mutationSnapshot);
                if (saved) {
                    if (selectedStatementCustomerId === custId) renderStatement();
                    alert(`تم تسجيل التحصيل بنجاح!\nالمتبقي على ${customer.name}: ${customer.balance} ج.م`);
                }
                return;
            }

            // حالة 2: المحل عليه رصيد مستحق للزبون
            if (credit > 0) {
                const amount = parseFloat(
                    prompt(`صرف رصيد مستحق للزبون\nالمستحق له: ${credit} ج.م\nأدخل المبلغ المصروف:`)
                );
                if (!amount || amount <= 0) return;
                if (amount > credit) {
                    alert('المبلغ أكبر من الرصيد المستحق للزبون.');
                    return;
                }

                const mutationSnapshot = beginMutation();
                if (!mutationSnapshot) return;

                customer.creditBalance = credit - amount;
                db.sales.push({
                    id: Date.now(),
                    customerId: custId,
                    trays: 0,
                    price: 0,
                    total: credit,
                    paid: amount,
                    remaining: customer.creditBalance,
                    originalCredit: credit,
                    remainingAfterPayout: customer.creditBalance,
                    type: 'credit_payout',
                    ...nowMeta()
                });

                const saved = await saveDB(mutationSnapshot);
                endMutation(saved, mutationSnapshot);
                if (saved) {
                    if (selectedStatementCustomerId === custId) renderStatement();
                    alert(`تم صرف الرصيد بنجاح!\nالمتبقي له: ${customer.creditBalance} ج.م`);
                }
                return;
            }

            alert('لا يوجد دين على الزبون ولا رصيد مستحق له.');
        }

        // =========================
        // المرتجعات
        // =========================
        function getCustomerSalesForReturn(customerId) {
            return db.sales
                .filter(s => s.type === 'sale' && s.customerId === customerId)
                .map(s => ({
                    ...s,
                    returnedTrays: Number(s.returnedTrays || 0),
                    availableTrays: Math.max(0, Number(s.trays || 0) - Number(s.returnedTrays || 0))
                }))
                .filter(s => s.availableTrays > 0)
                .sort((a, b) => Number(b.timestamp || b.id || 0) - Number(a.timestamp || a.id || 0));
        }

        function getReturnCustomerMatches() {
            const input = document.getElementById('returnCustomerInput');
            const q = String(input?.value || '').trim().toLowerCase();
            if (!q) return db.customers.slice();
            return db.customers.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                return name.includes(q) || phone.includes(q);
            });
        }

        function renderReturnCustomerResults() {
            const box = document.getElementById('returnCustomerResults');
            const input = document.getElementById('returnCustomerInput');
            if (!box || !input) return;

            const q = String(input.value || '').trim();
            const matches = getReturnCustomerMatches();

            if (!q) {
                box.style.display = 'none';
                box.innerHTML = '';
                return;
            }

            box.style.display = 'block';
            if (!matches.length) {
                box.innerHTML = '<div style="padding:12px;text-align:center;color:#64748b;">لا يوجد زبون مطابق</div>';
                return;
            }

            box.innerHTML = matches.slice(0, 20).map(c => `
                <button type="button" onclick="selectReturnCustomer(${c.id})"
                    style="display:block;width:100%;text-align:right;padding:10px 12px;border:0;border-bottom:1px solid #eee;background:#fff;cursor:pointer;">
                    <b>${Number(c.serial || 0)} - ${escapeHTML(c.name)}</b>
                    <span style="color:#64748b;margin-right:8px;">${escapeHTML(c.phone || '')}</span>
                    <span style="float:left;font-weight:bold;">${Number(c.balance || 0)} ج.م</span>
                </button>
            `).join('');
        }

        function selectReturnCustomer(customerId) {
            const customer = db.customers.find(c => Number(c.id) === Number(customerId));
            if (!customer) return;

            const input = document.getElementById('returnCustomerInput');
            const hidden = document.getElementById('returnCustomer');
            const box = document.getElementById('returnCustomerResults');
            if (input) input.value = customer.name;
            if (hidden) hidden.value = String(customer.id);
            if (box) { box.style.display = 'none'; box.innerHTML = ''; }
            updateReturnSalesOptions();
        }

        function handleReturnCustomerInput() {
            const input = document.getElementById('returnCustomerInput');
            const hidden = document.getElementById('returnCustomer');
            if (!input || !hidden) return;

            const typedName = input.value.trim().toLowerCase();
            const customer = db.customers.find(c => String(c.name || '').trim().toLowerCase() === typedName);
            hidden.value = customer ? String(customer.id) : '';
            renderReturnCustomerResults();
            updateReturnSalesOptions();
        }

        function updateReturnSalesOptions() {
            const customerId = Number(document.getElementById('returnCustomer')?.value || 0);
            const saleSelect = document.getElementById('returnSale');
            if (!saleSelect) return;

            if (!customerId) {
                saleSelect.innerHTML = '<option value="">اختر الزبون أولاً</option>';
                updateReturnPreview();
                return;
            }

            const sales = getCustomerSalesForReturn(customerId);
            saleSelect.innerHTML = sales.length
                ? '<option value="">اختر الفاتورة</option>' + sales.map(s => {
                    const d = getDateObject(s.date, s.timestamp);
                    const dayName = WEEK_DAYS_AR[d.getDay()];
                    const dateText = s.date || d.toLocaleDateString('ar-EG');
                    return `<option value="${s.id}">فاتورة - ${dayName} ${dateText} - ${s.trays} طبق - ${s.total} ج.م (متاح ${s.availableTrays})</option>`;
                  }).join('')
                : '<option value="">لا توجد كميات متاحة للمرتجع</option>';
            updateReturnPreview();
        }

        function updateReturnPreview() {
            const saleId = Number(document.getElementById('returnSale')?.value || 0);
            const sale = db.sales.find(s => Number(s.id) === saleId && s.type === 'sale');
            const qtyInput = document.getElementById('returnTrays');
            const info = document.getElementById('returnInfo');
            const value = document.getElementById('returnValue');
            if (!sale) {
                if (info) info.innerHTML = 'اختر الفاتورة لعرض الكمية المتاحة والسعر.';
                if (value) value.innerText = '0';
                if (qtyInput) qtyInput.max = '';
                return;
            }
            const available = Math.max(0, Number(sale.trays || 0) - Number(sale.returnedTrays || 0));
            if (qtyInput) {
                qtyInput.max = String(available);
                if (Number(qtyInput.value) > available) qtyInput.value = available;
            }
            const qty = Number(qtyInput?.value || 0);
            const total = qty * Number(sale.price || 0);
            if (info) info.innerHTML = `المباع: <b>${sale.trays}</b> طبق — المرتجع السابق: <b>${Number(sale.returnedTrays || 0)}</b> — المتاح للمرتجع: <b>${available}</b> — سعر الطبق: <b>${sale.price} ج.م</b>`;
            if (value) value.innerText = total;
        }

        async function addReturn(e) {
            e.preventDefault();
            if (!databaseReady) {
                alert('انتظر حتى يتم الاتصال بقاعدة البيانات.');
                return;
            }

            const customerId = Number(document.getElementById('returnCustomer').value || 0);
            const saleId = Number(document.getElementById('returnSale').value || 0);
            const trays = parseInt(document.getElementById('returnTrays').value, 10);
            const reason = document.getElementById('returnReason').value.trim();
            const customer = db.customers.find(c => Number(c.id) === customerId);
            const sale = db.sales.find(s => Number(s.id) === saleId && s.type === 'sale' && Number(s.customerId) === customerId);

            if (!customer || !sale) {
                alert('اختر الزبون والفاتورة بشكل صحيح.');
                return;
            }

            const alreadyReturned = Number(sale.returnedTrays || 0);
            const available = Number(sale.trays || 0) - alreadyReturned;
            if (!trays || trays < 1) {
                alert('أدخل كمية مرتجع صحيحة.');
                return;
            }
            if (trays > available) {
                alert(`لا يمكن إرجاع أكثر من ${available} طبق من هذه الفاتورة.`);
                return;
            }

            const returnValue = trays * Number(sale.price || 0);

            const mutationSnapshot = beginMutation(e?.submitter);
            if (!mutationSnapshot) return;

            // رجوع البضاعة للمخزن.
            db.stock += trays;

            // تعديل الفاتورة الأصلية مع الاحتفاظ بسجل المرتجع المستقل.
            sale.returnedTrays = alreadyReturned + trays;
            sale.netTotal = Math.max(0, Number(sale.total || 0) - sale.returnedTrays * Number(sale.price || 0));

            // المرتجع يقلل الدين أولاً، وأي مبلغ زائد يتحول لرصيد مستحق للزبون.
            const debtReduction = Math.min(Number(customer.balance || 0), returnValue);
            const creditAdded = returnValue - debtReduction;
            customer.balance = Math.max(0, Number(customer.balance || 0) - debtReduction);
            customer.creditBalance = Number(customer.creditBalance || 0) + creditAdded;
            if (debtReduction > 0) {
                db.periodCustomerDebt = Math.max(0, Number(db.periodCustomerDebt || 0) - debtReduction);
            }

            // تحديث متبقي الفاتورة وحركة المخزن المرتبطة (عشان متبقي عند الزبائن يقل)
            const prevSaleRem = getInvoiceRemaining(sale);
            const reduceSaleRem = Math.min(prevSaleRem, returnValue);
            sale.remaining = Math.max(0, prevSaleRem - reduceSaleRem);

            let leftReduce = returnValue;
            const relatedMovs = (db.inventoryMovements || [])
                .filter(m => m.type === 'sale' && (
                    Number(m.saleId) === Number(sale.id) ||
                    (Number(m.customerId) === Number(customer.id) && Number(m.remaining || 0) > 0)
                ))
                .sort((a, b) => {
                    // أولوية للحركة المرتبطة بنفس الفاتورة
                    const aMatch = Number(a.saleId) === Number(sale.id) ? 0 : 1;
                    const bMatch = Number(b.saleId) === Number(sale.id) ? 0 : 1;
                    if (aMatch !== bMatch) return aMatch - bMatch;
                    return Number(a.timestamp || 0) - Number(b.timestamp || 0);
                });
            for (const m of relatedMovs) {
                if (leftReduce <= 0) break;
                const cur = Math.max(0, Number(m.remaining || 0));
                if (cur <= 0) continue;
                const take = Math.min(cur, leftReduce);
                m.remaining = cur - take;
                leftReduce -= take;
                // لو الحركة مرتبطة بنفس الفاتورة خلّصنا
                if (Number(m.saleId) === Number(sale.id) && take > 0) {
                    // نستمر لو لسه في قيمة
                }
            }

            const meta = nowMeta();
            const returnRecord = {
                id: Date.now(),
                customerId: customer.id,
                customerName: customer.name,
                saleId: sale.id,
                trays,
                price: Number(sale.price || 0),
                total: returnValue,
                debtReduction,
                creditAdded,
                reason,
                type: 'return',
                ...meta
            };

            db.returns.push(returnRecord);
            sale.remaining = getInvoiceRemaining(sale);

            addInventoryMovement({
                type: 'return',
                trays,
                customerId: customer.id,
                customerName: customer.name,
                price: Number(sale.price || 0),
                total: returnValue,
                reason: reason || `مرتجع من فاتورة #${sale.id}`,
                source: 'مرتجع مبيعات'
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot, e?.submitter);
            if (saved) {
                e.target.reset();
                updateReturnSalesOptions();
                if (selectedStatementCustomerId === customer.id) renderStatement();
                alert(`تم تسجيل المرتجع بقيمة ${returnValue} ج.م وإرجاع ${trays} طبق للمخزن.`);
            }
        }



        async function paySupplier(supplierId) {
            const supplier = db.suppliers.find(s => Number(s.id) === Number(supplierId));
            if (!supplier) return;
            const debt = Number(supplier.balance || 0);
            if (debt <= 0) {
                alert('لا يوجد مبلغ متبقي لهذا المورد.');
                return;
            }
            const amount = parseFloat(prompt(`سداد لمورد: ${supplier.name}\nالمتبقي له: ${debt} ج.م\nأدخل المبلغ المدفوع:`));
            if (!amount || amount <= 0) return;
            if (amount > debt) {
                alert('المبلغ أكبر من المتبقي.');
                return;
            }
            const mutationSnapshot = beginMutation();
            if (!mutationSnapshot) return;
            supplier.balance = debt - amount;
            if (!Array.isArray(db.supplierPayments)) db.supplierPayments = [];
            db.supplierPayments.push({
                id: Date.now(),
                supplierId: supplier.id,
                supplierName: supplier.name,
                paid: amount,
                remaining: supplier.balance,
                type: 'supplier_payment',
                ...nowMeta()
            });
            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot);
            if (saved) {
                if (selectedSupplierStatementId === supplier.id) renderSupplierStatement();
                alert(`تم السداد بنجاح.\nالمتبقي للمورد: ${supplier.balance} ج.م`);
            }
        }

        let selectedSupplierStatementId = null;

        function getSupplierStatementMatches() {
            const q = (document.getElementById('supplierStatementSearch')?.value || '').trim().toLowerCase();
            if (!q) return db.suppliers.slice();
            return db.suppliers.filter(s =>
                String(s.name || '').toLowerCase().includes(q) ||
                String(s.phone || '').toLowerCase().includes(q)
            );
        }

        function renderSupplierStatementSearchResults() {
            const box = document.getElementById('supplierStatementSearchResults');
            if (!box) return;
            const q = (document.getElementById('supplierStatementSearch')?.value || '').trim();
            const matches = getSupplierStatementMatches();
            if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
            box.style.display = 'block';
            if (!matches.length) {
                box.innerHTML = '<div class="search-empty">لا يوجد مورد مطابق</div>';
                return;
            }
            box.innerHTML = matches.slice(0, 20).map(s => `
                <button type="button" class="search-result-item" onclick="selectSupplierStatement(${s.id})">
                    <b>${escapeHTML(s.name)}</b>
                    <span>${escapeHTML(s.phone || '')}</span>
                    <span style="float:left;font-weight:bold;">متبقي: ${Number(s.balance || 0)} ج.م</span>
                </button>
            `).join('');
        }

        function selectSupplierStatement(id) {
            selectedSupplierStatementId = Number(id);
            const s = db.suppliers.find(x => Number(x.id) === Number(id));
            const input = document.getElementById('supplierStatementSearch');
            const box = document.getElementById('supplierStatementSearchResults');
            if (s && input) input.value = s.name;
            if (box) { box.style.display = 'none'; box.innerHTML = ''; }
            renderSupplierStatement();
        }

        function searchSupplierStatement() {
            renderSupplierStatementSearchResults();
            const matches = getSupplierStatementMatches();
            const q = (document.getElementById('supplierStatementSearch')?.value || '').trim();
            if (!q) { selectedSupplierStatementId = null; renderSupplierStatement(); return; }
            const exact = matches.find(s => String(s.name || '').trim().toLowerCase() === q.toLowerCase());
            if (exact) selectSupplierStatement(exact.id);
            else if (matches.length === 1) selectSupplierStatement(matches[0].id);
        }

        function renderSupplierStatement() {
            const table = document.getElementById('supplierStatementTable');
            const title = document.getElementById('supplierStatementTitle');
            const summary = document.getElementById('supplierStatementSummary');
            if (!table) return;
            const supplier = db.suppliers.find(s => Number(s.id) === Number(selectedSupplierStatementId));
            if (!supplier) {
                table.innerHTML = '<tr><td colspan="7" style="text-align:center;">اكتب اسم المورد واختره من النتائج</td></tr>';
                if (title) title.innerText = 'كشف حساب مزرعة / مورد';
                if (summary) summary.innerHTML = '';
                return;
            }

            const supplierNameKey = String(supplier.name || '').trim().toLowerCase();
            const purchases = (db.inventoryMovements || [])
                .filter(m => {
                    if (m.type !== 'purchase') return false;
                    if (m.supplierId != null && Number(m.supplierId) === Number(supplier.id)) return true;
                    const n = String(m.supplierName || '').trim().toLowerCase();
                    return n && n === supplierNameKey;
                })
                .map(m => ({ ...m, eventTime: Number(m.timestamp || 0), kind: 'purchase' }));
            const payments = (db.supplierPayments || [])
                .filter(p => Number(p.supplierId) === Number(supplier.id))
                .map(p => ({ ...p, eventTime: Number(p.timestamp || 0), kind: 'payment' }));
            const periodStart = getSupplierStatementStart();
            const events = [...purchases, ...payments]
                .filter(e => Number(e.eventTime || 0) >= periodStart)
                .sort((a,b) => a.eventTime - b.eventTime);

            let totalBuy = 0, totalPaid = 0, runningRemaining = 0;
            const rows = events.map(h => {
                if (h.kind === 'payment') {
                    const paid = Number(h.paid || 0);
                    totalPaid += paid;
                    runningRemaining = Math.max(0, runningRemaining - paid);
                    // لو السجل فيه متبقي بعد السداد نفضّله
                    if (h.remaining != null && h.remaining !== '') {
                        runningRemaining = Math.max(0, Number(h.remaining));
                    }
                    return `<tr>
                        <td>${formatDateWithDay(h.date, h.timestamp)}</td>
                        <td><b>سداد</b></td>
                        <td>-</td>
                        <td>-</td>
                        <td>${paid} ج.م</td>
                        <td>-</td>
                        <td><b>${runningRemaining} ج.م</b></td>
                    </tr>`;
                }
                const lineRemaining = Math.max(0, Number(h.remaining != null ? h.remaining : (Number(h.total || 0) - Number(h.paid || 0))));
                totalBuy += Number(h.total || 0);
                totalPaid += Number(h.paid || 0);
                runningRemaining += lineRemaining;
                return `<tr>
                    <td>${formatDateWithDay(h.date, h.timestamp)}</td>
                    <td><b>شراء</b></td>
                    <td>${h.trays || '-'} طبق</td>
                    <td>${Number(h.total || 0)} ج.م</td>
                    <td>${Number(h.paid || 0)} ج.م</td>
                    <td><b>${lineRemaining} ج.م</b></td>
                    <td><b>${runningRemaining} ج.م</b></td>
                </tr>`;
            }).join('');

            table.innerHTML = rows || '<tr><td colspan="7" style="text-align:center;">لا توجد حركات</td></tr>';
            if (title) title.innerHTML = `كشف حساب: ${escapeHTML(supplier.name)} <span style="font-size:14px;color:#64748b">— المتبقي: <b>${Number(supplier.balance || 0)} ج.م</b></span>`;
            if (summary) {
                summary.innerHTML = `
                    <span>إجمالي المشتريات: <b>${totalBuy} ج.م</b></span>
                    <span>إجمالي المدفوع: <b>${totalPaid} ج.م</b></span>
                    <span>المتبقي للمورد: <b class="debt-total-text">${Number(supplier.balance || 0)} ج.م</b></span>
                `;
            }
        }

        async function editCustomer(custId) {
            const customer = db.customers.find(c => Number(c.id) === Number(custId));
            if (!customer) return;

            const newName = prompt('اسم الزبون:', customer.name || '');
            if (newName === null) return;
            const name = String(newName).trim();
            if (!name) {
                alert('الاسم مطلوب.');
                return;
            }

            const duplicate = db.customers.some(c =>
                Number(c.id) !== Number(custId) &&
                String(c.name || '').trim().toLowerCase() === name.toLowerCase()
            );
            if (duplicate) {
                alert('يوجد زبون آخر بنفس الاسم.');
                return;
            }

            const newPhone = prompt('رقم الهاتف:', customer.phone || '');
            if (newPhone === null) return;
            const phone = String(newPhone).trim();

            const mutationSnapshot = beginMutation();
            if (!mutationSnapshot) return;

            const oldName = customer.name;
            customer.name = name;
            customer.phone = phone;

            // تحديث الاسم في السجلات المرتبطة
            db.sales.forEach(s => {
                if (Number(s.customerId) === Number(custId)) s.customerName = name;
            });
            db.returns.forEach(r => {
                if (Number(r.customerId) === Number(custId)) r.customerName = name;
            });
            db.inventoryMovements.forEach(m => {
                if (Number(m.customerId) === Number(custId)) m.customerName = name;
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot);
            if (saved) {
                if (selectedStatementCustomerId === customer.id) renderStatement();
                alert('تم تعديل بيانات الزبون بنجاح.');
            }
        }

        async function editSupplier(supplierId) {
            const supplier = db.suppliers.find(s => Number(s.id) === Number(supplierId));
            if (!supplier) return;

            const newName = prompt('اسم المورد / المزرعة:', supplier.name || '');
            if (newName === null) return;
            const name = String(newName).trim();
            if (!name) {
                alert('الاسم مطلوب.');
                return;
            }

            const duplicate = db.suppliers.some(s =>
                Number(s.id) !== Number(supplierId) &&
                String(s.name || '').trim().toLowerCase() === name.toLowerCase()
            );
            if (duplicate) {
                alert('يوجد مورد آخر بنفس الاسم.');
                return;
            }

            const newPhone = prompt('رقم الهاتف:', supplier.phone || '');
            if (newPhone === null) return;
            const phone = String(newPhone).trim();

            const mutationSnapshot = beginMutation();
            if (!mutationSnapshot) return;

            supplier.name = name;
            supplier.phone = phone;

            // تحديث الاسم في حركات المخزن والمشتريات إن وُجد
            db.inventoryMovements.forEach(m => {
                if (m.type === 'purchase' && (Number(m.supplierId) === Number(supplierId) || m.supplierName === supplier.name || m.source === 'شراء من مزرعة')) {
                    // safer: match by previous name is hard; update if supplierId stored
                    if (Number(m.supplierId) === Number(supplierId)) m.supplierName = name;
                }
            });

            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot);
            if (saved) {
                alert('تم تعديل بيانات المورد بنجاح.');
            }
        }

        // =========================
        // البحث في الزبائن وكشف الحساب
        // =========================
        let selectedStatementCustomerId = null;

        function filterCustomers() {
            const input = document.getElementById('customerSearch');
            const q = (input?.value || '').trim().toLowerCase();
            const rows = db.customers.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                return !q || name.includes(q) || phone.includes(q);
            });

            const periodStart = getCustomersDebtStart();
            document.getElementById('customersTable').innerHTML = rows.length ? rows.map(c => {
                const allDebt = Math.max(0, Number(c.balance || 0));
                const periodDebt = periodStart ? getCustomerPeriodDebt(c.id, periodStart) : allDebt;
                const debtCell = periodStart
                    ? `<span class="debt-total-text">${periodDebt} ج.م</span><br><small style="color:#64748b;font-weight:600;">من الفترة</small><br><small>الإجمالي: ${allDebt} ج.م</small>`
                    : `${allDebt} ج.م`;
                const creditLine = Number(c.creditBalance || 0) ? `<br><small class="credit-text">له: ${Number(c.creditBalance || 0)} ج.م</small>` : '';
                return `
                <tr>
                    <td><b>${Number(c.serial || 0)}</b></td>
                    <td>${escapeHTML(c.name)}</td>
                    <td>${escapeHTML(c.phone || '-')}</td>
                    <td style="font-weight:bold">${debtCell}${creditLine}</td>
                    <td><button data-mutation-action="1" onclick="payDebt(${c.id})" style="padding:6px 12px; cursor:pointer; background:var(--primary); color:#fff; border:none; border-radius:6px;">سداد</button></td>
                    <td><button type="button" data-mutation-action="1" onclick="editCustomer(${c.id})" class="btn-edit-row">تعديل</button></td>
                </tr>
            `;
            }).join('') : '<tr><td colspan="6" style="text-align:center;">لا يوجد زبون مطابق للبحث</td></tr>';
        }

        function getStatementMatches() {
            const q = (document.getElementById('statementSearch')?.value || '').trim().toLowerCase();
            if (!q) return db.customers.slice();
            return db.customers.filter(c => {
                const name = String(c.name || '').toLowerCase();
                const phone = String(c.phone || '').toLowerCase();
                return name.includes(q) || phone.includes(q);
            });
        }

        function renderStatementSearchResults() {
            const box = document.getElementById('statementSearchResults');
            if (!box) return;
            const q = (document.getElementById('statementSearch')?.value || '').trim();
            const matches = getStatementMatches();

            if (!q) {
                box.style.display = 'none';
                box.innerHTML = '';
                return;
            }

            if (!matches.length) {
                box.style.display = 'block';
                box.innerHTML = '<div style="padding:12px;text-align:center;color:#64748b;">لا يوجد زبون مطابق</div>';
                return;
            }

            box.style.display = 'block';
            box.innerHTML = matches.slice(0, 20).map(c => `
                <button type="button" onclick="selectStatementCustomer(${c.id})"
                    style="display:block;width:100%;text-align:right;padding:10px 12px;border:0;border-bottom:1px solid #eee;background:#fff;cursor:pointer;">
                    <b>${Number(c.serial || 0)} - ${escapeHTML(c.name)}</b>
                    <span style="color:#64748b;margin-right:8px;">${escapeHTML(c.phone || '')}</span>
                    <span style="float:left;font-weight:bold;">${Number(c.balance || 0)} ج.م</span>
                </button>
            `).join('');
        }

        function selectStatementCustomer(custId) {
            const customer = db.customers.find(c => c.id === custId);
            if (!customer) return;
            selectedStatementCustomerId = custId;
            const input = document.getElementById('statementSearch');
            if (input) input.value = customer.name;
            const box = document.getElementById('statementSearchResults');
            if (box) { box.style.display = 'none'; box.innerHTML = ''; }
            renderStatement();
        }

        // Live Search: البحث يعمل مع كل ضغطة بدون زر بحث.
        function searchStatementCustomer() {
            const matches = getStatementMatches();
            const q = (document.getElementById('statementSearch')?.value || '').trim();
            renderStatementSearchResults();
            if (!q) {
                selectedStatementCustomerId = null;
                renderStatement();
                return;
            }
            // لو فيه تطابق كامل أو زبون واحد فقط، افتح كشفه فورًا.
            const exact = matches.find(c =>
                String(c.name || '').trim().toLowerCase() === q.toLowerCase() ||
                String(c.phone || '').trim().toLowerCase() === q.toLowerCase()
            );
            if (exact) selectStatementCustomer(exact.id);
            else if (matches.length === 1) selectStatementCustomer(matches[0].id);
        }

        function renderStatement() {
            const customer = db.customers.find(c => c.id === selectedStatementCustomerId);
            if (!customer) {
                document.getElementById('statementTable').innerHTML = '<tr><td colspan="8" style="text-align:center;">اكتب اسم الزبون أو رقمه واختره من النتائج</td></tr>';
                document.getElementById('custStatementTitle').innerText = 'كشف حساب';
                return;
            }

            const periodStart = getStatementStart();
            const allEvents = [
                ...db.sales.filter(s => Number(s.customerId) === Number(customer.id)).map(s => ({ ...s, eventTime: Number(s.timestamp || s.id || 0) })),
                ...db.returns.filter(r => Number(r.customerId) === Number(customer.id)).map(r => ({ ...r, eventTime: Number(r.timestamp || r.id || 0) }))
            ].sort((a, b) => a.eventTime - b.eventTime);

            let runningBalance = 0;
            let runningCredit = 0;

            // لو في فلتر تاريخ: ابنِ الرصيد من كل الحركات قبل البداية
            const buildOpening = (h) => {
                if (h.type === 'payment') {
                    if (h.remainingAfterPayment != null) runningBalance = Math.max(0, Number(h.remainingAfterPayment));
                    else runningBalance = Math.max(0, runningBalance - Number(h.paid || 0));
                } else if (h.type === 'credit_payout') {
                    if (h.remainingAfterPayout != null) runningCredit = Math.max(0, Number(h.remainingAfterPayout));
                    else runningCredit = Math.max(0, runningCredit - Number(h.paid || 0));
                } else if (h.type === 'return') {
                    runningBalance = Math.max(0, runningBalance - Number(h.debtReduction || 0));
                    runningCredit += Number(h.creditAdded || 0);
                } else if ((h.type || 'sale') === 'sale') {
                    const paidAtSale = Number(h.paidAtSale != null ? h.paidAtSale : (h.initialPaid != null ? h.initialPaid : 0));
                    // متبقي الفاتورة وقت البيع فقط (مش مدفوعات لاحقة)
                    const invRem = Math.max(0, Number(h.total || 0) - paidAtSale - Number(h.creditUsed || 0));
                    runningBalance += invRem;
                }
            };
            if (periodStart > 0) {
                allEvents.filter(e => e.eventTime < periodStart).forEach(buildOpening);
            }

            const events = allEvents.filter(e => e.eventTime >= periodStart);
            let totalSales = 0;
            let totalPaid = 0;
            let totalReturns = 0;
            const saleRemainingById = new Map();
            const rows = [];

            events.forEach(h => {
                if (h.type === 'payment') {
                    const payment = Number(h.paid || 0);
                    totalPaid += payment;
                    // المتبقي بعد التحصيل من السجل نفسه إن وُجد
                    if (h.remainingAfterPayment != null) {
                        runningBalance = Math.max(0, Number(h.remainingAfterPayment));
                    } else if (h.remaining != null && h.remaining !== '') {
                        runningBalance = Math.max(0, Number(h.remaining));
                    } else {
                        runningBalance = Math.max(0, runningBalance - payment);
                    }
                    rows.push({
                        date: h.date, timestamp: h.timestamp, type: 'تحصيل دفعة',
                        trays: '-', price: '-', total: '-', paid: payment,
                        saleRemaining: '-', remaining: runningBalance
                    });
                    return;
                }

                if (h.type === 'credit_payout') {
                    const payout = Number(h.paid || 0);
                    // المتبقي بعد الصرف: من السجل نفسه إن وُجد، وإلا من الرصيد المتراكم
                    let after;
                    if (h.remainingAfterPayout != null) {
                        after = Math.max(0, Number(h.remainingAfterPayout));
                    } else if (h.remaining != null && h.type === 'credit_payout') {
                        after = Math.max(0, Number(h.remaining));
                    } else {
                        after = Math.max(0, runningCredit - payout);
                    }
                    runningCredit = after;
                    rows.push({
                        date: h.date, timestamp: h.timestamp, type: 'صرف رصيد مستحق',
                        trays: '-', price: '-', total: '-', paid: payout,
                        saleRemaining: `له ${after}`,
                        remaining: runningBalance,
                        runningCredit: after
                    });
                    return;
                }

                if (h.type === 'return') {
                    const value = Number(h.total || 0);
                    const saleId = Number(h.saleId || 0);
                    runningBalance = Math.max(0, runningBalance - Number(h.debtReduction || 0));
                    runningCredit += Number(h.creditAdded || 0);
                    totalReturns += value;

                    // المرتجع مربوط بالفاتورة الأصلية، لذلك نخصم قيمته من متبقي نفس المبايعة.
                    let saleRemaining = '-';
                    if (saleId && saleRemainingById.has(saleId)) {
                        saleRemaining = Math.max(0, Number(saleRemainingById.get(saleId)) - value);
                        saleRemainingById.set(saleId, saleRemaining);
                    } else if (saleId) {
                        const originalSale = db.sales.find(s => Number(s.id) === saleId);
                        if (originalSale) {
                            const originalRemaining = Math.max(
                                0,
                                Number(originalSale.total || 0) - Number(originalSale.paid || 0) - Number(originalSale.creditUsed || 0)
                            );
                            const alreadyReturned = Number(originalSale.returnedTrays || 0);
                            const returnedValueBeforeThis = Math.max(0, alreadyReturned - Number(h.trays || 0)) * Number(originalSale.price || 0);
                            saleRemaining = Math.max(0, originalRemaining - returnedValueBeforeThis - value);
                            saleRemainingById.set(saleId, saleRemaining);
                        }
                    }

                    const creditAdded = Number(h.creditAdded || 0);
                    let saleRemainingDisplay = saleRemaining;
                    if (creditAdded > 0) {
                        // رصيد مستحق للزبون يظهر في عمود متبقي المبايعة
                        saleRemainingDisplay = `له ${creditAdded}`;
                    }
                    rows.push({
                        date: h.date, timestamp: h.timestamp, type: 'مرتجع',
                        trays: `-${h.trays}`, price: h.price ? h.price + ' ج.م' : '-',
                        total: -value, paid: '-', saleRemaining: saleRemainingDisplay,
                        remaining: runningBalance,
                        runningCredit: runningCredit > 0 ? runningCredit : 0
                    });
                    return;
                }

                const total = Number(h.total || 0);
                // المدفوع وقت البيع فقط (مش تحصيلات لاحقة)
                const paid = Number(h.paidAtSale != null ? h.paidAtSale : (h.initialPaid != null ? h.initialPaid : h.paid || 0));
                const creditUsed = Number(h.creditUsed || 0);
                const invoiceRemaining = Math.max(0, total - paid - creditUsed);
                runningCredit = Math.max(0, runningCredit - creditUsed);
                runningBalance += invoiceRemaining;
                totalSales += total;
                totalPaid += paid;

                // متبقي المبايعة مستقل عن إجمالي متبقي الزبون.
                // يبدأ بمتبقي الفاتورة نفسها، ثم يتأثر بالمرتجعات المرتبطة بها.
                if (h.type === 'sale') saleRemainingById.set(Number(h.id), invoiceRemaining);

                rows.push({
                    date: h.date, timestamp: h.timestamp, type: 'فاتورة بيع',
                    trays: h.trays || '-', price: h.price ? h.price + ' ج.م' : '-',
                    total, paid, saleRemaining: invoiceRemaining, remaining: runningBalance
                });
            });

            const currentBalance = Number(customer.balance || 0);
            const currentCredit = Number(customer.creditBalance || 0);
            document.getElementById('custStatementTitle').innerHTML =
                `كشف حساب: ${escapeHTML(customer.name)}
                <div class="statement-balances">
                    <span>المتبقي على الزبون: <b class="debt-total-text">${currentBalance} ج.م</b></span>
                    <span class="credit-chip">رصيد مستحق للزبون (له): <b>${currentCredit} ج.م</b></span>
                    <span>صافي الحساب: <b>${currentBalance - currentCredit} ج.م</b></span>
                </div>`;

            document.getElementById('statementTable').innerHTML = rows.length ? rows.map(r => `
                <tr>
                    <td>${formatDateWithDay(r.date, r.timestamp)}</td>
                    <td><b>${r.type}</b></td>
                    <td>${r.trays}</td>
                    <td>${r.price}</td>
                    <td>${r.total === '-' ? '-' : r.total + ' ج.م'}</td>
                    <td>${r.paid === '-' ? '-' : r.paid + ' ج.م'}</td>
                    <td>${r.saleRemaining === '-' ? '-' : (typeof r.saleRemaining === 'string' ? `<b class="credit-text">${r.saleRemaining} ج.م</b>` : `<b>${r.saleRemaining} ج.م</b>`)}</td>
                    <td><b>${r.remaining} ج.م</b>${r.runningCredit ? `<br><small class="credit-text">له متراكم: ${r.runningCredit} ج.م</small>` : ''}</td>
                </tr>
            `).join('') : '<tr><td colspan="8" style="text-align:center;">لا توجد حركات لهذا الزبون</td></tr>';

            const summary = document.getElementById('statementSummary');
            if (summary) {
                summary.innerHTML = `
                    <span>المتبقي على الزبون: <b class="debt-total-text">${currentBalance} ج.م</b></span>
                    <span class="credit-chip">إجمالي الرصيد المستحق (له): <b>${currentCredit} ج.م</b></span>
                `;
            }
        }

        function updateOrdersTable() {
            const table = document.getElementById('ordersTable');
            if (!table) return;
            // الأحدث أولاً
            const orders = [...(db.orders || [])].sort((a, b) => {
                const tb = Number(b.timestamp || 0);
                const ta = Number(a.timestamp || 0);
                if (tb !== ta) return tb - ta;
                return Number(b.serial || 0) - Number(a.serial || 0);
            });
            table.innerHTML = orders.map(o => `
                <tr>
                    <td><b>${Number(o.serial || 0)}</b></td>
                    <td>${formatDateWithDay(o.date, o.timestamp)}</td>
                    <td><b>${escapeHTML(o.name)}</b></td>
                    <td>${escapeHTML(o.phone)}</td>
                    <td>${escapeHTML(o.typeName || '')} (${o.trays} طبق)</td>
                    <td>${escapeHTML(o.address)}</td>
                    <td><b>${o.total} ج.م</b></td>
                    <td><span class="badge ${o.status === 'completed' ? 'badge-completed' : 'badge-pending'}">${o.status === 'completed' ? 'تم التوصيل' : 'جديد'}</span></td>
                    <td>${o.status === 'pending' ? `<button data-mutation-action="1" onclick="markOrderComplete('${escapeHTML(String(o.id))}')">تأكيد التوصيل</button>` : '✔'}</td>
                </tr>`).join('');
        }

        // =========================
        // تحديث الواجهة
        // =========================
        function updateUI() {
            // حماية نهائية: أي بيانات ناقصة من Firestore يتم استكمالها قبل عرض الواجهة
            db = normalizeDB(db);
            const stockDisplay = document.getElementById('stockDisplay');
            if (stockDisplay) stockDisplay.innerText = db.stock;

            // أسعار في الهيدر (تظهر في كل الصفحات)
            const hdrLarge = document.getElementById('hdrPriceLarge');
            const hdrMedium = document.getElementById('hdrPriceMedium');
            const hdrSmall = document.getElementById('hdrPriceSmall');
            if (hdrLarge) hdrLarge.innerText = db.prices.large;
            if (hdrMedium) hdrMedium.innerText = db.prices.medium;
            if (hdrSmall) hdrSmall.innerText = db.prices.small;

            const priceLargeDisplay = document.getElementById('priceLargeDisplay');
            const priceMediumDisplay = document.getElementById('priceMediumDisplay');
            const priceSmallDisplay = document.getElementById('priceSmallDisplay');
            if (priceLargeDisplay) priceLargeDisplay.innerText = db.prices.large;
            if (priceMediumDisplay) priceMediumDisplay.innerText = db.prices.medium;
            if (priceSmallDisplay) priceSmallDisplay.innerText = db.prices.small;

            const setMap = {
                setPriceLarge: 'large',
                setPriceMedium: 'medium',
                setPriceSmall: 'small',
                setPriceRedLarge: 'red_large',
                setPriceWhiteLarge: 'white_large',
                setPriceBashayer: 'bashayer'
            };
            for (const [id, key] of Object.entries(setMap)) {
                const el = document.getElementById(id);
                if (el) el.value = Number(db.prices[key] || 0);
            }

            const saleCustomerList = document.getElementById('saleCustomerList');
            if (saleCustomerList) saleCustomerList.innerHTML =
                db.customers.map(c => {
                    const debt = Number(c.balance || 0);
                    const credit = Number(c.creditBalance || 0);
                    let labelText = debt > 0 ? `عليه ${debt} ج.م` : (credit > 0 ? `له ${credit} ج.م` : 'مفيش ديون');
                    let detail = debt > 0 ? `عليه: ${debt} ج.م` : 'مفيش ديون';
                    if (credit > 0) detail += ` — رصيد له: ${credit} ج.م`;
                    return `<option value="${escapeHTML(c.name)}" label="${labelText}">${detail}</option>`;
                }).join('');

            const returnCustomerInput = document.getElementById('returnCustomerInput');
            const returnCustomerHidden = document.getElementById('returnCustomer');
            const returnCustomerList = document.getElementById('returnCustomerList');
            if (returnCustomerInput && returnCustomerHidden && returnCustomerList) {
                const currentReturnCustomerId = String(returnCustomerHidden.value || '');
                const currentCustomer = db.customers.find(c => String(c.id) === currentReturnCustomerId);
                if (currentCustomer && !returnCustomerInput.value.trim()) {
                    returnCustomerInput.value = currentCustomer.name;
                }
                updateReturnSalesOptions();
            }

            const statementSearch = document.getElementById('statementSearch');
            if (statementSearch && !statementSearch.dataset.liveBound) {
                statementSearch.addEventListener('input', searchStatementCustomer);
                statementSearch.addEventListener('focus', renderStatementSearchResults);
                statementSearch.dataset.liveBound = '1';
            }
            filterCustomers();
            renderStatementSearchResults();

            const totalCustomerDebt = db.customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance || 0)), 0);
            const totalDebtEl = document.getElementById('totalCustomerDebt');
            if (totalDebtEl) totalDebtEl.innerText = totalCustomerDebt + ' ج.م';
            updatePeriodCustomerDebtTotal();

            filterSuppliers();

            const purchaseSupplierInput = document.getElementById('purchaseSupplierInput');
            if (purchaseSupplierInput && !purchaseSupplierInput.dataset.liveBound) {
                purchaseSupplierInput.addEventListener('input', searchPurchaseSupplier);
                purchaseSupplierInput.addEventListener('focus', searchPurchaseSupplier);
                purchaseSupplierInput.dataset.liveBound = '1';
            }

            const purTrays = document.getElementById('purTrays');
            const purPrice = document.getElementById('purPrice');
            if (purTrays && !purTrays.dataset.calcBound) {
                purTrays.addEventListener('input', calcPurchase);
                purPrice?.addEventListener('input', calcPurchase);
                purTrays.dataset.calcBound = '1';
            }
            calcPurchase();

            updateOrdersTable();

            /* legacy inline orders rendering removed; orders now live in online_orders */
            /*
            document.getElementById('ordersTable').innerHTML =
                db.orders.map(o => `
                    <tr>
                        <td><b>${Number(o.serial || 0)}</b></td>
                        <td>${formatDateWithDay(o.date, o.timestamp)}</td>
                        <td><b>${escapeHTML(o.name)}</b></td>
                        <td>${escapeHTML(o.phone)}</td>
                        <td>${escapeHTML(o.typeName || '')} (${o.trays} طبق)</td>
                        <td>${escapeHTML(o.address)}</td>
                        <td><b>${o.total} ج.م</b></td>
                        <td>
                            <span class="badge ${o.status === 'completed' ? 'badge-completed' : 'badge-pending'}">
                                ${o.status === 'completed' ? 'تم التوصيل' : 'جديد'}
                            </span>
                        </td>
                        <td>
                            ${o.status === 'pending'
                                ? `<button data-mutation-action="1" onclick="markOrderComplete(${o.id})"
                                    style="padding:5px 10px; background:var(--success); color:#fff; border:none; border-radius:6px; cursor:pointer;">
                                    تأكيد التوصيل
                                   </button>`
                                : '✔'}
                        </td>
                    </tr>
                `).join('');
            */

            // نعرض فقط حركات الفترة الحالية بعد آخر تصفير يدوي.
            // المخزون الفعلي db.stock لا يتأثر بالتصفير إطلاقًا.
            const resetAt = Number(db.inventoryResetAt || 0);
            const dateStart = getInventoryStart();
            // لو اختار تاريخ: من التاريخ لحد الآن
            // لو مفيش تاريخ: بعد آخر إعادة إدارة (السلوك القديم)
            const movements = [...db.inventoryMovements]
                .filter(m => {
                    const ts = Number(m.timestamp || 0);
                    if (dateStart) return ts >= dateStart;
                    return ts > resetAt;
                })
                .sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
            const totalIn = movements.filter(m => m.type === 'purchase').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            const totalSold = movements.filter(m => m.type === 'sale').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            const totalWasted = movements.filter(m => m.type === 'wastage').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            const totalReturned = movements.filter(m => m.type === 'return').reduce((sum,m) => sum + Number(m.trays || 0), 0);
            // بعد إعادة الإدارة: الداخل = 0
            // بعد أي شراء: الداخل = المشتريات + المتبقي وقت إعادة الإدارة
            const stockAtReset = Number(db.stockAtReset || 0);
            // إضافة المتبقي وقت إعادة الإدارة فقط في وضع إعادة الإدارة (مش مع فلتر التاريخ)
            const inventoryInValue = dateStart
                ? totalIn
                : (totalIn > 0 ? (totalIn + stockAtReset) : 0);
            document.getElementById('inventoryIn').innerText = inventoryInValue;
            // إجمالي الشراء من المزرعة (أموال الفترة)
            const periodPurchaseMoney = movements
                .filter(m => m.type === 'purchase')
                .reduce((sum, m) => sum + Number(m.total || 0), 0);
            const purchaseValueAtReset = Number(db.purchaseValueAtReset || 0);
            const purchaseMoneyDisplay = dateStart
                ? periodPurchaseMoney
                : (periodPurchaseMoney > 0 ? (periodPurchaseMoney + purchaseValueAtReset) : 0);
            const purchaseMoneyEl = document.getElementById('inventoryPurchaseMoney');
            if (purchaseMoneyEl) purchaseMoneyEl.innerText = purchaseMoneyDisplay;
            // إجمالي مبيعات أموال = فلوس المبيعات في الفترة
            const totalMoneyIn = movements.filter(m => m.type === 'sale').reduce((sum,m) => sum + Number(m.total || 0), 0);
            const moneyEl = document.getElementById('inventoryMoneyIn');
            if (moneyEl) moneyEl.innerText = totalMoneyIn;
            document.getElementById('inventorySold').innerText = totalSold;
            document.getElementById('inventoryWasted').innerText = totalWasted;
            const returnDisplay = document.getElementById('inventoryReturned');
            if (returnDisplay) returnDisplay.innerText = totalReturned;
            const totalReturnedMoney = movements
                .filter(m => m.type === 'return')
                .reduce((sum, m) => sum + Math.max(0, Number(m.total || 0)), 0);
            const returnMoneyEl = document.getElementById('inventoryReturnedMoney');
            if (returnMoneyEl) returnMoneyEl.innerText = totalReturnedMoney;
            document.getElementById('inventoryRemaining').innerText = db.stock;

            document.getElementById('inventoryTable').innerHTML = movements.length ? movements.map(m => {
                const typeLabel = m.type === 'sale' ? 'بيع' : m.type === 'purchase' ? 'شراء' : m.type === 'return' ? 'مرتجع' : 'تالف / كسر';
                const typeClass = m.type === 'sale' ? 'badge-completed' : m.type === 'purchase' ? 'badge-pending' : m.type === 'return' ? 'badge-return' : '';
                const person = (m.type === 'sale' || m.type === 'return') ? escapeHTML(m.customerName || 'غير محدد') : (m.type === 'purchase' ? escapeHTML(m.supplierName || m.source || '-') : escapeHTML(m.source || '-'));
                let extra = '';
                if (m.type === 'sale') {
                    // لو الحركة مربوطة بفاتورة، نعرض متبقي الفاتورة الحالي (بعد سداد/مرتجع)
                    let rem = Number(m.remaining || 0);
                    let paid = Number(m.paid || 0);
                    if (m.saleId != null) {
                        const inv = (db.sales || []).find(s => Number(s.id) === Number(m.saleId) && (s.type === 'sale' || !s.type));
                        if (inv) {
                            rem = Number(inv.remaining != null ? inv.remaining : rem);
                            paid = Number(inv.paid != null ? inv.paid : paid);
                        }
                    }
                    extra = `<br><small>مدفوع: ${paid} ج.م</small>` + (rem > 0 ? `<br><small class="debt-total-text">متبقي على الزبون: ${rem} ج.م</small>` : `<br><small class="credit-text">مسدد بالكامل</small>`);
                }
                return `<tr>
                    <td>${formatDateWithDay(m.date, m.timestamp)}</td>
                    <td><span class="badge ${typeClass}">${typeLabel}</span></td>
                    <td><b>${m.trays}</b> طبق</td>
                    <td>${person}${extra}</td>
                    <td>${m.price ? m.price + ' ج.م' : '-'}</td>
                    <td>${m.total ? m.total + ' ج.م' : '-'}</td>
                    <td>${escapeHTML(m.reason || '-')}</td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center; color:#64748b;">لا توجد حركات مخزن حتى الآن</td></tr>';

            calcSale();
        }

        // كشف الحساب يتم عبر البحث بالاسم من خلال searchStatementCustomer().


        // تصفير حركة المخزن للفترة الحالية فقط.
        // لا يغيّر المخزون الحالي ولا يحذف البيانات من Firebase؛ فقط يبدأ فترة جديدة للعرض والحسابات.
        async function resetInventoryStats() {
            if (!databaseReady) {
                alert('انتظر حتى يتم تحميل قاعدة البيانات أولًا.');
                return;
            }

            const currentStock = Number(db.stock || 0);
            const confirmed = confirm(
                `سيتم تصفير إجمالي الداخل والمبيعات والتالف والمرتجعات وحركات الفترة الحالية.\n\n` +
                `المتبقي في المخزن (${currentStock} طبق) لن يتغير.\n\n` +
                `بعد التصفير، أي شراء جديد أو بيع جديد سيبدأ في حساب فترة جديدة.\n\nهل تريد المتابعة؟`
            );
            if (!confirmed) return;

            const mutationSnapshot = beginMutation();
            if (!mutationSnapshot) return;

            db.inventoryResetAt = Date.now();
            db.stockAtReset = currentStock;
            db.periodCustomerDebt = 0;
            // تقدير قيمة المتبقي بتكلفة متوسط الشراء السابقة
            const allPurchases = (db.inventoryMovements || []).filter(m => m.type === 'purchase');
            const boughtTrays = allPurchases.reduce((s, m) => s + Number(m.trays || 0), 0);
            const boughtMoney = allPurchases.reduce((s, m) => s + Number(m.total || 0), 0);
            const avgCost = boughtTrays > 0 ? (boughtMoney / boughtTrays) : 0;
            db.purchaseValueAtReset = Math.round(currentStock * avgCost);
            const saved = await saveDB(mutationSnapshot);
            endMutation(saved, mutationSnapshot);
            if (saved) {
                updateUI();
                alert(`تم تصفير حركة المخزن بنجاح.\nالمتبقي الحالي: ${currentStock} طبق`);
            }
        }

        function renderInventory() {
            updateUI();
        }

        // =========================
        // تشغيل التطبيق
        // =========================
        // لأننا نستخدم <script type="module">، الدوال لا تكون global تلقائيًا.
        // هذه الأسطر تجعل أزرار HTML الحالية قادرة على استدعائها.
        Object.assign(window, {
            adminLogout,
            toggleAdminMode,
            toggleSidebar,
            switchTab,
            calcOnlineOrder,
            submitOnlineOrder,
            updatePrices,
            markOrderComplete,
            calcSale,
            addSale,
            addCustomer,
            addSupplier,
            filterSuppliers,
            paySupplier,
            searchSupplierStatement,
            selectSupplierStatement,
            renderSupplierStatement,
            renderSupplierStatementSearchResults,
            paySupplier,
            searchSupplierStatement,
            selectSupplierStatement,
            renderSupplierStatement,
            renderSupplierStatementSearchResults,
            searchPurchaseSupplier,
            selectPurchaseSupplier,
            calcPurchase,
            addPurchase,
            addWastage,
            payDebt,
            addReturn,
            updateReturnSalesOptions,
            handleReturnCustomerInput,
            renderReturnCustomerResults,
            selectReturnCustomer,
            updateReturnPreview,
            renderStatement,
            searchStatementCustomer,
            selectStatementCustomer,
            filterCustomers,
            clearCustomersDebtDate,
            onStatementDateChange,
            clearStatementDate,
            onSupplierStatementDateChange,
            clearSupplierStatementDate,
            onInventoryDateChange,
            clearInventoryDate,
            updatePeriodCustomerDebtTotal,
            editCustomer,
            editSupplier,
            renderInventory,
            resetInventoryStats
        });

        // =============================================
        // ربط الدوال المستخدمة داخل HTML بالـ window
        // لأن هذا الملف يعمل باستخدام type="module".
        // =============================================
        Object.assign(window, {
            adminLogout,
            toggleAdminMode,
            toggleSidebar,
            switchTab,
            calcOnlineOrder,
            submitOnlineOrder,
            updatePrices,
            markOrderComplete,
            calcSale,
            addSale,
            addCustomer,
            addSupplier,
            filterSuppliers,
            searchPurchaseSupplier,
            selectPurchaseSupplier,
            calcPurchase,
            addPurchase,
            addWastage,
            payDebt,
            addReturn,
            updateReturnSalesOptions,
            handleReturnCustomerInput,
            renderReturnCustomerResults,
            selectReturnCustomer,
            updateReturnPreview,
            renderStatement,
            selectStatementCustomer,
            searchStatementCustomer,
            filterCustomers,
            clearCustomersDebtDate,
            onStatementDateChange,
            clearStatementDate,
            onSupplierStatementDateChange,
            clearSupplierStatementDate,
            onInventoryDateChange,
            clearInventoryDate,
            updatePeriodCustomerDebtTotal,
            editCustomer,
            editSupplier,
            renderInventory,
            resetInventoryStats
        });

        // بدء لوحة الإدارة فقط بعد تسجيل دخول Firebase Authentication
        console.log("EGG STORE ADMIN SECURE - loaded");
        onAuthStateChanged(auth, async (user) => {
            // رفض الجلسات الفارغة أو Anonymous (من واجهة الزبون)
            if (!user || user.isAnonymous || !user.email) {
                try {
                    if (user && user.isAnonymous) {
                        await signOut(auth);
                    }
                } catch (e) {
                    console.warn(e);
                }
                window.location.replace("login.html");
                return;
            }
            adminReady = true;
            toggleAdminMode(true);
            startAdminListeners();
        });