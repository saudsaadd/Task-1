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
| المساعد الذكي | يظهر في كل الصفحات | دردشة تعمل بـ Claude عبر `api/chat.js`، وتجيب من الأسئلة الشائعة إذا لم يُضبط المفتاح |
| الإشعارات | الجرس أعلى كل صفحة | إعلانات إدارية مع عدّاد غير المقروء وشريط إعلان مثبّت |
| الحسابات | نافذة منبثقة في كل الصفحات | «تسجيل الدخول» و«حساب جديد» (الاسم، البريد، كلمة المرور) مع حفظ في `localStorage`، ثم تحويل تلقائي إلى لوحتي |
| دليل الهوية | `brand.html` | الشعارات للتحميل، الألوان، الخطوط، قواعد الاستخدام |
| استوديو AGILIX | `studio.html` (للمالك فقط) | محادثة Claude لكتابة المحتوى، وتوليد الصور والفيديو، ومكتبة لما ولّدته |

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

### تفعيل المساعد الذكي (اختياري)
في Vercel ← **Settings ← Environment Variables** أضف:

| المتغير | مطلوب؟ | الوصف |
|---|---|---|
| `ANTHROPIC_API_KEY` | نعم، لتفعيل الذكاء الاصطناعي | مفتاح من [console.anthropic.com](https://console.anthropic.com) |
| `CHAT_MODEL` | لا | النموذج المستخدم (الافتراضي `claude-opus-5-5`) |
| `ALLOWED_ORIGINS` | لا | نطاقات مسموح لها باستخدام المساعد، مفصولة بفواصل، مثل `https://academy.example.com` |
| `CHAT_RATE_LIMIT` | لا | عدد الرسائل لكل زائر كل 10 دقائق (الافتراضي 30) |

ثم أعد النشر. بدون المفتاح يبقى المساعد يعمل في «وضع الإجابات السريعة» من ملف الأسئلة الشائعة والدورات.
يقرأ المساعد محتوى `data/*.json` تلقائيًا (الدورات، الدروس، الباقات، الأسئلة الشائعة)، ولا يطّلع على إجابات الاختبارات.

### المعاينة على جهازك
المتصفح لا يقرأ ملفات JSON عند فتح الصفحة مباشرة (`file://`)، لذلك شغّل خادمًا بسيطًا:
```bash
npx serve .        # ثم افتح http://localhost:3000
# أو مع المساعد الذكي:
npx vercel dev
```

---

## استوديو AGILIX: أداة الذكاء الاصطناعي الخاصة بك (للمالك فقط)
صفحة مخفية على `www.agilix.space/studio.html`، غير موجودة في القائمة ولا تظهر في محركات البحث، وتطلب كلمة مرور لا يعرفها غيرك. فيها أربعة أقسام:

| القسم | ماذا يفعل | يعمل بـ |
|---|---|---|
| **المحادثة** | يكتب سكربتات الدروس، وأوصاف الدورات، وأسئلة الاختبارات بصيغة JSON جاهزة للصق في `quizzes.json`، والمنشورات التسويقية. يعرف هوية AGILIX ودوراتك | Claude |
| **الصور** | يولّد أغلفة الدورات وصور التسويق من وصف نصي. زر «حسّن الوصف» يحوّل وصفك العربي إلى وصف إنجليزي مفصّل تفهمه النماذج أفضل | fal.ai (Nano Banana 2، Imagen 4) |
| **الفيديو** | يولّد فيديو مع صوت (حتى 8 ثوانٍ) من وصف نصي، أو يحرّك صورة من المكتبة أو من جهازك | fal.ai (Google Veo 3.1 Fast) |
| **المكتبة** | كل ما ولّدته: فتح، تنزيل، نسخ الرابط، تحريك صورة، إعادة استخدام الوصف، حذف | |

### التفعيل (مرة واحدة)
1. ارفع المشروع كاملًا كالعادة، ومعه `api/` و`package.json` و`vercel.json` و`studio.html` و`data/studio.json`.
2. في Vercel ← مشروعك ← **Settings ← Environment Variables** أضف:

   | المتغير | الوصف |
   |---|---|
   | `ADMIN_PASSWORD` | **مطلوب.** كلمة مرور الاستوديو، 12 حرفًا على الأقل. اجعلها طويلة وعشوائية |
   | `ANTHROPIC_API_KEY` | للمحادثة وتحسين الأوصاف، من [console.anthropic.com](https://console.anthropic.com) (هو نفسه مفتاح المساعد الذكي) |
   | `FAL_KEY` | للصور والفيديو، من [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) بعد شحن رصيد |

3. أعد النشر (Redeploy)، ثم افتح `www.agilix.space/studio.html` وأدخل كلمة المرور.

الصفحة تشرح لك حالتها بنفسها: إن نقص `ADMIN_PASSWORD` تعرض خطوات الإعداد، وإن ظهرت رسالة «تعذّر الوصول إلى خادم الاستوديو» فمعناها أن مجلد `api` لم يعمل كدوال خادم. في هذه الحالة انشر بإحدى طريقتَي النشر أعلاه (GitHub أو Vercel CLI).

### استخدام النتائج في المنصة
- **غلاف دورة:** انسخ رابط الصورة من المكتبة وضعه في `cover` للدورة داخل `data/courses.json`.
- **فيديو درس:** انسخ رابط الفيديو وضعه في `videoUrl` للدرس.
- الملفات محفوظة على خوادم fal.ai وقد لا تبقى روابطها للأبد. للاستخدام الدائم نزّل الملف وارفعه مع موقعك (مثلًا في `assets/media/`) أو على YouTube، وضع ذلك الرابط.
- المحادثة والمكتبة محفوظتان في متصفحك فقط.

### التكلفة والأمان
- كل توليد يُخصم من رصيدك عند Anthropic أو fal.ai مباشرة، والفيديو أغلى بكثير من الصور.
- كل طلب يمر عبر الخادم `api/studio.js`، فلا تصل المفاتيح إلى المتصفح أبدًا. ويقبل الخادم فقط النماذج والخيارات المكتوبة في `data/studio.json`.
- تغيير `ADMIN_PASSWORD` (ثم إعادة النشر) يُخرج كل الجلسات المفتوحة. وبعد 8 محاولات خاطئة من نفس عنوان الإنترنت يتوقف الخادم عن قبول الدخول منه 15 دقيقة. هذه حماية إضافية فقط، والحماية الأساسية كلمة مرور طويلة وعشوائية.
- الجلسة تنتهي بعد 12 ساعة.

### إضافة نموذج أو تغييره
النماذج في `data/studio.json`. انسخ معرّف النموذج من صفحته في [fal.ai/models](https://fal.ai/models) (مثل `fal-ai/kling-video/...`)، واكتب الخيارات التي تريد إظهارها تحت `options`. الصيغة موضحة داخل الملف.

### حدود المحادثة
مدة دالة الخادم 60 ثانية (`vercel.json`). إذا توقف رد طويل يظهر زر «أكمل». إن كان مشروعك يعمل بـ Fluid compute، وهو الافتراضي للمشاريع الجديدة، فيمكنك رفع `maxDuration` للدالة `api/studio.js` إلى 300 وإضافة المتغير `STUDIO_MAX_SECONDS=290`.

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
│   ├── js/chat.js        ← واجهة المساعد الذكي
│   ├── js/ui.js          ← مكونات مشتركة (الباقات، الشهادة، الآراء)
│   ├── js/pages/*.js     ← منطق كل صفحة
│   └── img/              ← الشعارات (اللاتيني، العربي، ثنائي اللغة) والأيقونة
├── brand.html            ← دليل الهوية البصرية
├── studio.html           ← استوديو الذكاء الاصطناعي (للمالك فقط)
├── data/                 ← كل المحتوى القابل للتعديل (JSON)
├── api/chat.js           ← دالة Vercel للمساعد الذكي (Claude)
├── api/studio.js         ← دالة Vercel للاستوديو: الدخول، Claude، وتوليد الصور والفيديو عبر fal.ai
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

**AGILIX**: a complete bilingual (Arabic RTL / English LTR) training-platform front-end in a light brand theme (Agilix Blue #2E5BFF, Teal #14B8C4, Coral #FF6B3D, Ink #0E1630; Poppins + Tajawal; brand guide at `brand.html`): 3D glass-cube hero with chromatic dispersion and the logo inside the glass, course catalogue, course player (YouTube/Vimeo/MP4 + live sessions with countdown, join link, calendar and recordings), quiz engine (single/multiple/true-false/text, exam & practice modes, timer, partial credit, negative marking, grading scale, instant review), learner dashboard, certificate (print/PDF, LinkedIn), pricing & checkout (hosted payment links, demo mode otherwise), contact & FAQ, notifications and an AI assistant powered by Claude (`api/chat.js`, needs `ANTHROPIC_API_KEY`; falls back to FAQ answers).

- **Deploy:** import the repo on Vercel with Root Directory `training-platform` and preset “Other”, or run `npx vercel --prod` inside the folder. No build step.
- **Edit content:** everything lives in `data/*.json` (`{ "ar": …, "en": … }` for every text); UI labels are in `data/i18n/`.
- **Brand:** the name is always the Latin wordmark **AGILIX**, in both languages, never translated; the Arabic «أجيليكس» wordmark only accompanies it. Logo files live in `assets/img/` (`logo.svg`, `logo-white.svg`, `logo-bilingual.svg`, `logo-bilingual-white.svg`, `logo-ar.svg`, `logo-ar-white.svg`, `logo-mark.svg`, `favicon.svg`); colours in `site.json → theme`.
- **Accounts:** the header “Sign in” / learner button opens a sign-in / create-account modal. Accounts live in `localStorage` (`academy.users.v1`, salted SHA-256 password hashes; `academy.session.v1`; per-user progress in `academy.state.v1:<id>`). After success the user is redirected to `dashboard.html`, or back to the page whose action required an account. Demo account: `demo@agilix.app` / `agilix2026`. These accounts are per-browser only: swap `signUp` / `signIn` / `signOut` in `assets/js/app.js` for a real auth service before launch.
- **Owner studio (`studio.html`):** a hidden, password-protected AI workspace. Claude chat for course content (scripts, outlines, quiz JSON, posts), image generation (Nano Banana 2, Imagen 4) and video generation (Veo 3.1 Fast, text or image to video) through fal.ai, with a local library. Set `ADMIN_PASSWORD` (12+ characters), `ANTHROPIC_API_KEY` and `FAL_KEY` in Vercel and redeploy. All calls go through `api/studio.js` (HMAC-signed 12-hour tokens, model allowlist in `data/studio.json`, keys never reach the browser).
- **Navigation:** logo + Home → `index.html`, Courses → `courses.html`, Pricing → `pricing.html`, Dashboard → `dashboard.html`, Contact → `contact.html` (relative links, also hard-coded in each HTML file).
- **Before launch:** progress is stored in the visitor's browser; real accounts and payment-verified access need a backend (e.g. Supabase/Firebase + payment webhooks). Replace the sample testimonials, contact details and live links.
