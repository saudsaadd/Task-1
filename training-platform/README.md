# AGILIX: منصة التدريب (الواجهة الأمامية)

واجهة منصة تدريب كاملة بالعربية والإنجليزية، جاهزة للنشر على **Vercel** بلا خطوة بناء (Build).
كل النصوص والروابط والدورات والاختبارات والأسعار موجودة في ملفات **JSON** داخل مجلد `data/`، فتعدّلها دون لمس الكود.

> English summary at the end of this file.

---

## ما الذي يتضمنه المشروع؟

| الصفحة | الملف | المحتوى |
|---|---|---|
| الرئيسية | `index.html` | الواجهة ثلاثية الأبعاد (مكعب زجاجي يكسر الضوء ويحمل الشعار) + المزايا + الدورات المميزة + البث القادم + معاينة الشهادة + آراء المتدربين + الباقات + الأسئلة الشائعة |
| الدورات | `courses.html` | بحث، تصفية بالتصنيف والمستوى، ترتيب |
| صفحة الدورة | `course.html?id=…` | مشغّل الفيديو (YouTube / Vimeo / MP4)، البث المباشر (عدّاد تنازلي + زر الانضمام + إضافة للتقويم + التسجيل بعد الجلسة)، الدروس المقروءة، تحديد الإنجاز، الملفات، التقييمات |
| الاختبارات | `quiz.html?id=…` | اختيار من متعدد، اختيارات متعددة، صح/خطأ، إجابة مكتوبة. وضع اختبار ووضع تدريب، مؤقت، تعليم الأسئلة، درجات جزئية، خصم للإجابات الخاطئة، سُلّم تقديرات، نتيجة فورية ومراجعة مفصلة |
| لوحة الطالب | `dashboard.html` | مؤشرات الأداء، الدورات ونِسب الإنجاز، مخطط وقت التعلّم، سجل النتائج، الإعلانات، الجلسات القادمة، الشهادات |
| الشهادة | `certificate.html?course=…` | معاينة للجميع، والشهادة الفعلية عند إكمال الدروس والنجاح في الاختبار. طباعة / حفظ PDF، إضافة إلى LinkedIn |
| الأسعار | `pricing.html` | باقات شهرية/سنوية، شراء دورة منفردة، جدول مقارنة، ضمان الاسترداد |
| الدفع | `checkout.html` | بيانات المشتري، طرق الدفع، رموز الخصم، الضريبة، ثم التحويل لصفحة الدفع الآمنة |
| التواصل | `contact.html` | نموذج تواصل، قنوات الدعم، طلب تجربة/عرض توضيحي، أسئلة شائعة قابلة للبحث |
| المساعد الذكي | يظهر في كل الصفحات | دردشة مجانية تعمل بحصة Cloudflare Workers AI عبر `api/chat.js`، وتجيب من الأسئلة الشائعة والدورات إذا لم يُضبط أو انتهت حصة اليوم |
| الإشعارات | الجرس أعلى كل صفحة | إعلانات إدارية مع عدّاد غير المقروء وشريط إعلان مثبّت |
| الحسابات | نافذة منبثقة في كل الصفحات | «تسجيل الدخول» و«حساب جديد» (الاسم، البريد، كلمة المرور) مع حفظ في `localStorage`، ثم تحويل تلقائي إلى لوحتي |
| دليل الهوية | `brand.html` | الشعارات للتحميل، الألوان، الخطوط، قواعد الاستخدام |
| استوديو AGILIX | `studio.html` (للمالك فقط) | أدوات ذكاء اصطناعي مجانية: محادثة لكتابة المحتوى (سحابية أو على جهازك)، وتوليد الصور، وصانع فيديو في المتصفح، ومكتبة لما صنعته |

زر **English / العربية** في الأعلى يبدّل اللغة واتجاه الصفحة (RTL / LTR) فورًا، ويتذكر اختيار الزائر.

### روابط القائمة العلوية
| العنصر | الملف |
|---|---|
| الشعار و«الرئيسية» | `index.html` |
| «الدورات» | `courses.html` (وتبقى مفعّلة داخل `course.html` و`quiz.html`) |
| «الأسعار» | `pricing.html` (وداخل `checkout.html`) |
| «لوحتي» | `dashboard.html` (وداخل `certificate.html`) |
| «تواصل معنا» | `contact.html` |

الروابط مكتوبة في `site.json ← navigation`، ومكتوبة أيضًا داخل كل ملف HTML، فتعمل القائمة حتى قبل تحميل JavaScript. كل الروابط نسبية (`courses.html` وليس `/courses`)، فتعمل على Vercel وعلى أي استضافة ثابتة.

### الحسابات وتسجيل الدخول
- زر **«تعلّمي»** وزر **«تسجيل الدخول»** في الشريط العلوي يفتحان نافذة الحساب بتبويبين: «تسجيل الدخول» و«حساب جديد».
- بعد نجاح الدخول أو إنشاء الحساب تظهر رسالة ترحيب، ثم ينتقل المستخدم بسلاسة إلى **لوحتي** (`dashboard.html`). إذا فُتحت النافذة من إجراء يحتاج حسابًا (مثل «تحديد الدرس كمكتمل» أو «ابدأ الاختبار» أو الدفع)، يعود المستخدم إلى الصفحة نفسها ليكمل ما بدأه.
- بعد الدخول يتحوّل الزر إلى قائمة الحساب (الصورة الرمزية): لوحتي، النتائج، الشهادات، تسجيل الخروج.
- **ما يحتاج حسابًا:** لوحتي، حفظ التقدّم في الدروس، الاختبارات، الشراء. التصفّح ومعاينة الدروس المجانية متاحة للجميع.
- **حساب تجريبي جاهز:** زر «جرّب المنصة بحساب تجريبي» داخل النافذة، أو `demo@agilix.app` / `agilix2026`، ويأتي ببيانات تقدّم ونتائج للعرض. غيّر بريده وكلمة مروره من `student.json ← demoAccount`، أو أوقفه بجعل `"seedDemoData": false` فيختفي الزر.
- **التخزين (`localStorage`):**

  | المفتاح | المحتوى |
  |---|---|
  | `academy.users.v1` | الحسابات: الاسم، البريد، و**بصمة** كلمة المرور (SHA-256 مع Salt)، ولا تُحفظ كلمة المرور نفسها |
  | `academy.session.v1` | الحساب المسجّل حاليًا |
  | `academy.state.v1:<id>` | تقدّم كل حساب ونتائجه ومشترياته على حدة |

> هذه الحسابات للتجربة على المتصفح نفسه فقط: لا تنتقل بين الأجهزة، ويمكن لأي شخص يستخدم الجهاز نفسه رؤيتها. لحسابات حقيقية اربط النافذة نفسها بخدمة مصادقة مثل Supabase Auth أو Firebase Auth أو Clerk. الدوال `signUp` و`signIn` و`signOut` في `assets/js/app.js` هي المكان الوحيد الذي يحتاج تغييرًا.

---

## النشر على Vercel

يحتاج المشروع إلى مستودع Git أو أداة Vercel CLI (لوحة Vercel لا تقبل رفع مجلد بالسحب والإفلات).

### الطريقة 1: من GitHub (موصى بها)
1. ارفع المجلد إلى مستودع على GitHub (أو استخدم هذا المستودع).
2. من [vercel.com/new](https://vercel.com/new) اختر **Import** للمستودع.
3. في **Root Directory** اختر `training-platform` (إن كان المجلد داخل مستودع أكبر).
4. **Framework Preset:** `Other`، واترك أمر البناء ومجلد المخرجات فارغين.
5. اضغط **Deploy**.

### الطريقة 2: من جهازك عبر Vercel CLI
```bash
cd training-platform     # أو المجلد بعد فك ضغط training-platform.zip
npx vercel               # نشر تجريبي
npx vercel --prod        # نشر نهائي
```

### تفعيل المساعد الذكي (مجاني)
المساعد الذي يظهر للزوار في كل الصفحات (`api/chat.js`) يعمل بنفس حصة Cloudflare المجانية التي يستخدمها الاستوديو، وبنفس المتغيرين. لا يحتاج أي مفتاح مدفوع.

| المتغير | مطلوب؟ | الوصف |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | نعم | معرّف حسابك: Cloudflare ← Workers AI ← Use REST API ← Account ID (32 خانة) |
| `CLOUDFLARE_API_TOKEN` | نعم | من نفس الصفحة: Create a Workers AI API Token |
| `CHAT_MODEL` | لا | لتغيير نموذج المساعد فقط. الافتراضي هو `cloud.chatModel` في `data/studio.json` |
| `ALLOWED_ORIGINS` | لا | نطاقات مسموح لها باستخدام المساعد، مفصولة بفواصل، مثل `https://www.agilix.space` |
| `CHAT_RATE_LIMIT` | لا | عدد الرسائل لكل زائر كل 10 دقائق (الافتراضي 30) |

ثم أعد النشر (Deployments ← آخر نشر ← Redeploy)، فالمتغيرات لا تُطبَّق قبل ذلك.

- **للتأكد من الإعداد:** افتح `www.agilix.space/api/chat` في المتصفح. ستظهر حالة الإعداد دون أي أسرار: `"ready": true` معناها أن كل شيء مضبوط، وإلا فستجد في `missing` أو `problems` اسم المتغير الناقص أو الخاطئ. وللاختبار الكامل مع اتصال فعلي استخدم زر «فحص الاتصال» في الاستوديو.
- **النموذج:** `@cf/google/gemma-4-26b-a4b-it` (Gemma 4 من Google)، وإن رفضه Cloudflare لحسابك ينتقل تلقائيًا إلى البديل `@cf/qwen/qwen3-30b-a3b-fp8`. لا تستخدم أسماء قديمة مثل `@cf/meta/llama-3-8b-instruct`، فهي لم تعد في كتالوج Cloudflare الحالي.
- **الحصة مشتركة:** المساعد والاستوديو يستهلكان نفس الحصة اليومية. إذا انتهت، أو لم يُضبط Cloudflare، يجيب المساعد تلقائيًا من الأسئلة الشائعة والدورات، فلا يتعطل أبدًا.
- يقرأ المساعد محتوى `data/*.json` تلقائيًا (الدورات، الدروس، الباقات، الأسئلة الشائعة)، ولا يطّلع على إجابات الاختبارات.

### المعاينة على جهازك
المتصفح لا يقرأ ملفات JSON عند فتح الصفحة مباشرة (`file://`)، لذلك شغّل خادمًا بسيطًا:
```bash
npx serve .        # ثم افتح http://localhost:3000
# أو مع المساعد الذكي:
npx vercel dev
```

---

## استوديو AGILIX: أداة الذكاء الاصطناعي الخاصة بك (للمالك فقط، مجانًا)
صفحة مخفية على `www.agilix.space/studio.html`، غير موجودة في القائمة ولا تظهر في محركات البحث، وتطلب كلمة مرور لا يعرفها غيرك. **لا تستخدم أي خدمة مدفوعة ولا تطلب بطاقة ائتمان.**

| القسم | ماذا يفعل | يعمل بـ | الحد |
|---|---|---|---|
| **المحادثة** | يكتب سكربتات الدروس، وأوصاف الدورات، وأسئلة الاختبارات بصيغة JSON، والمنشورات التسويقية | محركان تختار بينهما: **السحابة المجانية** (Gemma 4 من Google عبر Cloudflare)، أو **على جهازك** (Qwen3 مفتوح المصدر عبر WebLLM) | السحابة: حصة يومية مجانية تتجدد. على جهازك: **بلا حدود** |
| **الصور** | يولّد أغلفة الدورات وصور التسويق، مع زر «حسّن الوصف» | FLUX.2 klein و FLUX.1 schnell عبر Cloudflare | حوالي 95 إلى 170 صورة يوميًا مجانًا، تتجدد كل يوم |
| **الفيديو** | صانع فيديو: اكتب الموضوع فيكتب لك السيناريو، ثم يولّد صور المشاهد، وتضيف تعليقك بصوتك أو ملفًا صوتيًا، ويصدّر فيديو MP4 أو WebM بشعار AGILIX ونصوص المشاهد | متصفحك نفسه (Canvas و MediaRecorder) | **بلا حدود** |
| **المكتبة** | كل صورك وفيديوهاتك: تنزيل، إضافة كمشهد، إعادة استخدام الوصف، حذف | تخزين المتصفح (IndexedDB) | حسب مساحة جهازك |

### التفعيل (مرة واحدة)
1. ارفع المشروع كاملًا كالعادة، ومعه `api/` و`vercel.json` و`studio.html` و`data/studio.json` و`assets/js/studio-llm-worker.js`.
2. أنشئ حساب Cloudflare مجانيًا من [dash.cloudflare.com](https://dash.cloudflare.com/sign-up). لا يطلب بطاقة.
3. في لوحة Cloudflare افتح صفحة **Workers AI** ← **Use REST API**:
   - اضغط **Create a Workers AI API Token** ← **Create API Token** ← **Copy API Token**. هذا هو المفتاح.
   - وفي نفس الصفحة انسخ قيمة **Account ID**.
4. في Vercel ← مشروعك ← **Settings ← Environment Variables** أضف:

   | المتغير | الوصف |
   |---|---|
   | `ADMIN_PASSWORD` | **مطلوب.** كلمة مرور الاستوديو، 12 حرفًا على الأقل. اجعلها طويلة وعشوائية |
   | `CLOUDFLARE_ACCOUNT_ID` | معرّف حسابك في Cloudflare |
   | `CLOUDFLARE_API_TOKEN` | مفتاح Workers AI الذي أنشأته |

5. أعد النشر (Redeploy)، ثم افتح `www.agilix.space/studio.html` وأدخل كلمة المرور.

بدون متغيرَي Cloudflare يبقى المحرك المحلي وصانع الفيديو يعملان، وتظهر رسالة توضّح كيف تفعّل السحابة. وإن ظهرت رسالة «تعذّر الوصول إلى خادم الاستوديو» فمعناها أن مجلد `api` لم يعمل كدوال خادم؛ انشر حينها عبر GitHub أو Vercel CLI.

### «مجاني» و«بلا حدود»: ما الفرق؟
- **السحابة المجانية (Cloudflare Workers AI):** 10,000 وحدة يوميًا بلا مقابل، تكفي تقريبًا 150 رسالة أو 95 صورة، وتتجدد الساعة 3 فجرًا بتوقيت السعودية (00:00 UTC). عند انتهائها تظهر رسالة واضحة، ولا يُخصم أي مبلغ لأن الحساب المجاني لا يحمل بطاقة.
- **على جهازك (WebLLM):** النموذج يعمل على كرت الشاشة في جهازك، فلا حصة ولا تكلفة ولا يخرج نصك من الجهاز. يحتاج Chrome أو Edge حديثًا يدعم WebGPU على كمبيوتر، ويُنزَّل مرة واحدة: حوالي 1.1 جيجابايت (Qwen3 1.7B)، أو 2.3 (Qwen3 4B، الموصى به)، أو 4.6 (Qwen3 8B). جودته العربية أقل من السحابة لكنها جيدة للمسودات.
- **صانع الفيديو:** كل شيء يحدث في متصفحك، فهو مجاني بلا حدود. التصدير يستغرق نفس مدة الفيديو، فأبقِ الصفحة ظاهرة حتى ينتهي. Chrome يصدّر MP4، وبعض المتصفحات تصدّر WebM، وكلاهما يقبله YouTube.
- **ما ليس مجانيًا في أي مكان:** توليد مقاطع فيديو بالذكاء الاصطناعي من نص (مثل Veo أو Sora) يحتاج خوادم ضخمة، ولا توجد له اليوم خدمة مجانية بلا حدود. لذلك يصنع الاستوديو الفيديو من صور مولّدة مع حركة سينمائية ونصوص وصوت.

### استخدام النتائج في المنصة
- الملفات محفوظة في متصفحك على هذا الجهاز فقط، فنزّل ما تريد استخدامه.
- **غلاف دورة:** ارفع الصورة مع موقعك (مثلًا في `assets/media/`) وضع مسارها في `cover` للدورة داخل `data/courses.json`.
- **فيديو درس:** ارفعه على YouTube أو مع موقعك، وضع رابطه في `videoUrl` للدرس.

### الأمان
- كل طلب سحابي يمر عبر الخادم `api/studio.js`، فلا يصل مفتاح Cloudflare إلى المتصفح أبدًا. ويقبل الخادم فقط النماذج المكتوبة في `data/studio.json`.
- تغيير `ADMIN_PASSWORD` ثم إعادة النشر يُخرج كل الجلسات المفتوحة، والجلسة تنتهي بعد 12 ساعة.
- بعد 8 محاولات دخول خاطئة من نفس عنوان الإنترنت يتوقف الخادم عن قبولها 15 دقيقة. هذه حماية إضافية فقط، والحماية الأساسية كلمة مرور طويلة وعشوائية.
- يحتاج تسجيل التعليق الصوتي إذن الميكروفون، وهو مسموح لصفحات موقعك فقط (`vercel.json`).

### تغيير النماذج
الإعدادات في `data/studio.json`: نموذج المحادثة السحابي، والنماذج المحلية وأحجامها، ونماذج الصور وأبعادها، وإعدادات الفيديو. النماذج المتاحة مجانًا في [كتالوج Workers AI](https://developers.cloudflare.com/workers-ai/models/)، وبعضها يتطلب خطة مدفوعة فتجنّبه.

### حدود المحادثة السحابية
مدة دالة الخادم 60 ثانية (`vercel.json`). إذا توقف رد طويل يظهر زر «أكمل».

---

## تعديل المحتوى (بدون برمجة)

كل نص يُكتب بالشكل `{ "ar": "...", "en": "..." }`. عدّل القيم فقط واحتفظ بأسماء المفاتيح.

| الملف | ما الذي يتحكم به |
|---|---|
| `data/site.json` | اسم المنصة، الشعار، الألوان، اللغة الافتراضية، نصوص الواجهة ثلاثية الأبعاد ووجوه المكعب الستة، روابط القائمة، بيانات التواصل، الشبكات الاجتماعية، إعدادات المساعد، العملة والضريبة وطرق الدفع ورموز الخصم، بيانات الشهادة |
| `data/courses.json` | التصنيفات، الدورات، الدروس، روابط الفيديو والبث، الملفات |
| `data/quizzes.json` | الاختبارات والأسئلة وسُلّم التقديرات |
| `data/plans.json` | الباقات والأسعار وروابط الدفع وجدول المقارنة |
| `data/faq.json` | الأسئلة الشائعة وتصنيفاتها |
| `data/testimonials.json` | آراء المتدربين |
| `data/announcements.json` | الإشعارات والإعلانات (و `pinned: true` لشريط أعلى الصفحة) |
| `data/student.json` | بيانات الطالب التجريبي في لوحة التحكم (`seedDemoData: false` لإيقافها) |
| `data/i18n/ar.json` و `en.json` | نصوص الأزرار والعناوين الثابتة في الواجهة |

### الهوية البصرية لـ AGILIX
دليل الهوية الكامل متاح داخل الموقع في صفحة **`brand.html`** (الشعارات للتحميل، الألوان، الخطوط، قواعد الاستخدام).

| العنصر | القيمة |
|---|---|
| الفكرة | سهمان متتاليان نحو الأعلى يشكّلان حرف «A» مجرّدًا: تقدّم مرحلة بعد مرحلة (Agile). السهم المرجاني هو خطوة المتعلّم التالية، وتكرّره نقطتا الحرف i في الاسم |
| الاسم | **AGILIX** يُكتب دائمًا بالحروف اللاتينية في الشعار والعناوين والواجهة بكلتا اللغتين، ولا يُترجم. الشعار العربي «أجيليكس» يرافقه فقط كتوقيع بجانبه أو تحته، ولا يحلّ محلّه |
| الشعار الكامل | `assets/img/logo.svg` (للخلفيات الفاتحة)، و`assets/img/logo-white.svg` (للخلفيات الداكنة) |
| الشعار ثنائي اللغة | `assets/img/logo-bilingual.svg` و`logo-bilingual-white.svg`: الرمز + agilix + فاصل + أجيليكس. يظهر في الشريط العلوي على الشاشات العريضة، وفي التذييل ونافذة الحساب |
| الشعار العربي | `assets/img/logo-ar.svg` و`logo-ar-white.svg`: «أجيليكس» بخط Tajawal، ويظهر تحت عنوان AGILIX الضخم في الواجهة ثلاثية الأبعاد (`site.json ← brand.logoArabic`) |
| الرمز / الأيقونة | `assets/img/logo-mark.svg` و`assets/img/favicon.svg` (يظهر داخل المكعب الزجاجي وفي الشهادة) |
| الألوان | أزرق أجيليكس `#2E5BFF` · فيروزي `#14B8C4` · مرجاني `#FF6B3D` · حبري `#0E1630` · سحابي `#F6F7FB` · أبيض `#FFFFFF` |
| الخطوط | Poppins للاتيني، Tajawal للعربي |
| الشعار اللفظي | «تعلّم بمرونة، وتقدّم أسرع» / “Learn agile. Grow faster.” |

- **اسم المنصة:** `site.json ← brand.name` قيمته `AGILIX` في اللغتين عمدًا. اترك القيمتين متطابقتين ليبقى الاسم لاتينيًا في الواجهة العربية أيضًا.
- **تغيير الألوان:** `site.json ← theme` (`primary` و`secondary` و`highlight` و`ink` و`background`).
- **العنوان الضخم خلف المكعب:** `site.json ← hero.headline`.
- **تغيير الشعار:** استبدل الملفات في `assets/img/` بنفس الأسماء. وإن كان شعارك رمزًا فقط دون اسم، اجعل `"headerShowsName": true` داخل `brand` ليظهر الاسم نصًّا بجانبه.
- كل الصفحات بتصميم فاتح؛ الشريط الإعلاني والتذييل ومشغّل الفيديو بلون حبري داكن للتباين.

### روابط الفيديو والبث المباشر (`courses.json`)
```json
{ "id": "l1", "type": "video", "duration": 12,
  "title": { "ar": "مقدمة", "en": "Introduction" },
  "videoUrl": "https://www.youtube.com/watch?v=XXXXXXXXXXX" }
```
- `videoUrl` يقبل: YouTube، Vimeo، رابط ملف `.mp4`/`.webm`، أو أي رابط تضمين `https` (Bunny، Wistia، Loom…).
- درس البث المباشر:
```json
{ "id": "l4", "type": "live", "duration": 60,
  "startsAt": "2026-10-12T19:00:00+03:00", "platform": "Zoom",
  "liveUrl": "https://zoom.us/j/…",
  "embedUrl": "https://www.youtube.com/watch?v=…",
  "recordingUrl": "" }
```
  `liveUrl` رابط الانضمام، و`embedUrl` (اختياري) لعرض البث داخل الصفحة أثناء الجلسة، و`recordingUrl` يظهر بعد انتهائها.
- درس قراءة: `"type": "reading"` مع `content`.
- `"preview": true` يجعل الدرس متاحًا مجانًا قبل التسجيل. و`"price": 0` يجعل الدورة مجانية.

### الاختبارات (`quizzes.json`)
| النوع | قيمة `answer` |
|---|---|
| `single` اختيار واحد | رقم الخيار الصحيح بدءًا من 0 |
| `multiple` اختيارات متعددة | قائمة أرقام، مثل `[0, 2]` |
| `truefalse` صح/خطأ | `true` أو `false` |
| `text` إجابة مكتوبة | قائمة الإجابات المقبولة (لا يهم حجم الأحرف أو الهمزات) |

إعدادات كل اختبار: `mode` (`exam` النتيجة في النهاية، `practice` تصحيح فوري)، `timeLimit` بالدقائق (0 = بلا حد)، `passMark` نسبة النجاح، `shuffleQuestions` و`shuffleOptions`، `partialCredit` درجات جزئية للاختيارات المتعددة، `negativeMarking` خصم للإجابة الخاطئة، و`points` لكل سؤال.

### الدفع الإلكتروني
أنشئ رابط دفع جاهز من مزوّد الدفع (Stripe Payment Links، Moyasar، Tap، PayPal…) وضعه في:
- `plans.json ← paymentLinks.monthly / yearly` للباقات
- `courses.json ← paymentLink` للدورة المنفردة

في إعدادات رابط الدفع لدى المزوّد، اجعل صفحة النجاح تعود إلى:
`https://نطاقك/checkout.html?plan=pro&cycle=yearly&status=success` (أو `?course=ID&status=success`).
ما دام الرابط فارغًا تعمل صفحة الدفع في **وضع تجريبي** واضح، ولا تطلب بيانات بطاقة ولا تخصم شيئًا. بيانات البطاقة تُدخل دائمًا في صفحة المزوّد الآمنة، لا في موقعك.

### نموذج التواصل
ضع رابط نموذج من خدمة مثل Formspree في `site.json ← contactForm.endpoint` لتصلك الرسائل على البريد. إذا تُرك فارغًا يفتح النموذج تطبيق البريد لدى الزائر والرسالة جاهزة.

---

## ملاحظات مهمة قبل الإطلاق
- **الحسابات وحفظ التقدّم:** هذه واجهة أمامية؛ الحسابات وتقدّم الطالب ونتائجه ومشترياته تُحفظ في متصفحه (`localStorage`). لحسابات حقيقية تعمل على عدة أجهزة، وللتحكم الآمن في الوصول بعد الدفع (عبر Webhooks من مزوّد الدفع)، اربط المنصة بخادم أو بخدمة مثل Supabase أو Firebase.
- **آراء المتدربين** في `testimonials.json` أمثلة لتجربة التصميم فقط. استبدلها بآراء حقيقية (بإذن أصحابها) قبل النشر.
- بيانات التواصل في `site.json` (`support@example.com`، الهاتف…) وروابط البث (`example.com`) أمثلة يجب تغييرها.
- الفيديوهات التجريبية مقاطع عامة من مكتبة Google للاختبار؛ ضع روابط دروسك مكانها.

---

## بنية الملفات
```
training-platform/
├── index.html            ← الصفحة الرئيسية + الواجهة ثلاثية الأبعاد (CSS و JS مضمّنان)
├── courses.html  course.html  quiz.html  dashboard.html  certificate.html
├── pricing.html  checkout.html  contact.html  404.html
├── assets/
│   ├── css/app.css       ← نظام التصميم (الألوان والمكونات)
│   ├── js/app.js         ← اللغة، التخزين، الحسابات، الشريط العلوي، الإشعارات
│   ├── js/auth.js        ← نافذة تسجيل الدخول / الحساب الجديد
│   ├── js/studio-llm-worker.js ← تشغيل النموذج المحلي للاستوديو (WebLLM)
│   ├── js/chat.js        ← واجهة المساعد الذكي
│   ├── js/ui.js          ← مكونات مشتركة (الباقات، الشهادة، الآراء)
│   ├── js/pages/*.js     ← منطق كل صفحة
│   └── img/              ← الشعارات (اللاتيني، العربي، ثنائي اللغة) والأيقونة
├── brand.html            ← دليل الهوية البصرية
├── studio.html           ← استوديو الذكاء الاصطناعي (للمالك فقط)
├── data/                 ← كل المحتوى القابل للتعديل (JSON)
├── api/chat.js           ← دالة Vercel للمساعد الذكي (Cloudflare Workers AI المجاني)
├── api/studio.js         ← دالة Vercel للاستوديو: الدخول، والنصوص والصور عبر Cloudflare Workers AI المجاني
├── vercel.json  package.json
```

### عن الواجهة ثلاثية الأبعاد
- خلفية فاتحة بلون الهوية مع توهجات ناعمة بالأزرق والفيروزي والمرجاني، وظل خفيف تحت المكعب.
- Three.js r169 عبر `importmap` (`three` و`three/addons/`: GLTFLoader و BufferGeometryUtils و RoundedBoxGeometry).
- مجسم المكعب ذو الحواف الدائرية يُحمَّل من ملف GLB (`site.json ← hero.model`)، ويُستخدم `RoundedBoxGeometry(1, 1, 1, 8, 0.12)` إذا تعذّر تحميله.
- الانكسار والتشتت اللوني (Chromatic Dispersion) عبر `ShaderMaterial` مخصص من مرحلتين: الوجوه الخلفية ثم الأمامية، مع 14 عينة طيفية. العنوان الضخم يُرسم كنسيج خلف المكعب فينكسر عبر الزجاج.
- الشعار يطفو داخل الزجاج على مستوى في مركز المكعب، وينكسر ويتشتت مع الدوران.
- السحب بالفأرة أو اللمس للتدوير مع قصور ذاتي (Inertia)، ودوران هادئ تلقائي، وميلان خفيف مع حركة المؤشر.
- العدّاد الجانبي يتبع الوجه المقابل للمشاهد (6 أوجه = 6 مزايا من `hero.pillars`)، وأزرار الأسهم تدير المكعب إلى الوجه التالي.
- يحترم إعداد «تقليل الحركة»، ويتوقف عن الرسم عند الخروج من الشاشة، ويعرض بديلًا ثابتًا إذا لم يدعم الجهاز WebGL.

---

## English summary

**AGILIX**: a complete bilingual (Arabic RTL / English LTR) training-platform front-end in a light brand theme (Agilix Blue #2E5BFF, Teal #14B8C4, Coral #FF6B3D, Ink #0E1630; Poppins + Tajawal; brand guide at `brand.html`): 3D glass-cube hero with chromatic dispersion and the logo inside the glass, course catalogue, course player (YouTube/Vimeo/MP4 + live sessions with countdown, join link, calendar and recordings), quiz engine (single/multiple/true-false/text, exam & practice modes, timer, partial credit, negative marking, grading scale, instant review), learner dashboard, certificate (print/PDF, LinkedIn), pricing & checkout (hosted payment links, demo mode otherwise), contact & FAQ, notifications and a free AI assistant on the Cloudflare Workers AI free allowance (`api/chat.js`, needs `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`; open `/api/chat` in a browser to see its setup status; falls back to FAQ answers).

- **Deploy:** import the repo on Vercel with Root Directory `training-platform` and preset “Other”, or run `npx vercel --prod` inside the folder. No build step.
- **Edit content:** everything lives in `data/*.json` (`{ "ar": …, "en": … }` for every text); UI labels are in `data/i18n/`.
- **Brand:** the name is always the Latin wordmark **AGILIX**, in both languages, never translated; the Arabic «أجيليكس» wordmark only accompanies it. Logo files live in `assets/img/` (`logo.svg`, `logo-white.svg`, `logo-bilingual.svg`, `logo-bilingual-white.svg`, `logo-ar.svg`, `logo-ar-white.svg`, `logo-mark.svg`, `favicon.svg`); colours in `site.json → theme`.
- **Accounts:** the header “Sign in” / learner button opens a sign-in / create-account modal. Accounts live in `localStorage` (`academy.users.v1`, salted SHA-256 password hashes; `academy.session.v1`; per-user progress in `academy.state.v1:<id>`). After success the user is redirected to `dashboard.html`, or back to the page whose action required an account. Demo account: `demo@agilix.app` / `agilix2026`. These accounts are per-browser only: swap `signUp` / `signIn` / `signOut` in `assets/js/app.js` for a real auth service before launch.
- **Owner studio (`studio.html`), free of charge:** a hidden, password-protected AI workspace with no paid services. Text runs on the Cloudflare Workers AI free allowance (Gemma 4; 10,000 neurons a day, no card) or fully on-device with WebLLM (Qwen3, unlimited, needs WebGPU). Images use FLUX.2 klein / FLUX.1 schnell on the same free allowance. Videos are assembled in the browser from scenes (AI-written script, generated or uploaded images, captions, recorded or uploaded narration) and exported with MediaRecorder. Media is stored in IndexedDB. Set `ADMIN_PASSWORD`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Workers AI → Use REST API) in Vercel and redeploy.
- **Navigation:** logo + Home → `index.html`, Courses → `courses.html`, Pricing → `pricing.html`, Dashboard → `dashboard.html`, Contact → `contact.html` (relative links, also hard-coded in each HTML file).
- **Before launch:** progress is stored in the visitor's browser; real accounts and payment-verified access need a backend (e.g. Supabase/Firebase + payment webhooks). Replace the sample testimonials, contact details and live links.
