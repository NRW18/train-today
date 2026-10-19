# Expanded machine catalog

New exercises are optional and off by default. Original 15 IDs and metadata remain unchanged.

**Draft scope:** 36 new strength entries, 51 total. The current app supports only
PUSH/PULL/LEGS. Approval to add a separate `cardio` day was requested as instructed;
treadmill, stationary bike, elliptical, rowing ergometer and stair climber await
that answer and are not claimed complete. No new day type is silently introduced.

Search matches Thai and English in either UI language, including saved custom
exercises. Categories start folded, remember their open state separately from
user training data, and open matching results while searching. Camera, Gemini,
photo credits and the existing manual guide/rest/membership paths remain.

Compatibility uses an optional `catalogVersion: 1` backup field: old state/backups
default the new entries off. Explicit activation and existing off choices survive
save/reload/import. No name-based merge or deletion of `S.custom` is performed.
The original plan/suggest results are compared with the complete catalog disabled,
including recovery/pain, morning/evening, energy, home/gym, prior loads and running.
Only when a new exercise is enabled does its additional primary target join recovery
checks (for example, inner thighs); old day definitions and 15 exercise records stay
unchanged. The inner-thigh muscle and hip joint are available in existing symptom
selectors. Sample data still uses the original exercises.
Assisted dip/pull-up kilograms mean assistance, not resistance: their suggestions
retain a manually chosen support setting and explicitly label it, rather than
applying ordinary weight increases in the wrong direction. Original exercise
suggestions are unchanged and compared in the preservation tests.

All 36 schematics are original `currentColor` SVG symbols, drawn for this change,
with `viewBox="0 0 120 90"`. No new photos, stock assets or third-party drawings are
used. Existing 15 cutouts, source credits and licenses remain unchanged. Symbols
are illustrative and are not a trained image-recognition model.

Guides are original concise text, not medical advice. General technique/safety
references used for review: [ACE exercise library](https://www.acefitness.org/resources/everyone/exercise-library/),
[Mayo Clinic weight-training technique](https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/weight-training/art-20045842).
No reference text or photos are copied; no endorsement is implied.

| ID | Thai | English | Day | Group |
|---|---|---|---|---|
| incline_chest_press | อินไคลน์เชสต์เพรส (เครื่องอกบน) | Incline chest press machine | push | chest |
| lateral_raise_machine | ยกไหล่ด้านข้าง (เครื่อง) | Lateral raise machine | push | chest |
| assisted_dip | ดิพ (เครื่องช่วยพยุง) | Assisted dip machine | push | arms |
| assisted_pullup | ดึงข้อ (เครื่องช่วยพยุง) | Assisted pull-up machine | pull | back |
| high_row | ไฮโรว์ (เครื่องดึงหลังแนวสูง) | High row machine | pull | back |
| chest_supported_row | โรว์แบบมีแผ่นรองอก | Chest-supported row machine | pull | back |
| cable_row | ซีทเต็ดโรว์ (เคเบิล) | Seated cable row | pull | back |
| cable_fly | เคเบิลฟลาย | Cable chest fly | push | chest |
| cable_face_pull | เฟซพูล (เคเบิลเชือก) | Cable rope face pull | pull | back |
| cable_lateral_raise | ยกไหล่ด้านข้าง (เคเบิล) | Cable lateral raise | push | chest |
| cable_curl | ไบเซ็ปส์เคิร์ล (เคเบิล) | Cable biceps curl | pull | arms |
| overhead_triceps_extension | เหยียดหลังแขนเหนือหัว (เคเบิล) | Cable overhead triceps extension | push | arms |
| preacher_curl | พรีชเชอร์เคิร์ล (ม้านั่งกับบาร์อีซี) | Preacher bench EZ-bar curl | pull | arms |
| biceps_curl_machine | ไบเซ็ปส์เคิร์ล (เครื่อง) | Biceps curl machine | pull | arms |
| triceps_extension_machine | เหยียดหลังแขน (เครื่อง) | Triceps extension machine | push | arms |
| hack_squat | แฮ็กสควอต (เครื่อง) | Hack squat machine | legs | legs |
| smith_squat | สควอต (สมิธแมชชีน) | Smith machine squat | legs | legs |
| smith_bench_press | เบนช์เพรส (สมิธแมชชีน) | Smith machine bench press | push | chest |
| barbell_squat | บาร์เบลแบ็กสควอต (แร็ค) | Barbell back squat in rack | legs | legs |
| barbell_bench_press | บาร์เบลเบนช์เพรส (ม้านั่งกับแร็ค) | Barbell bench press with rack | push | chest |
| incline_db_press | ดันดัมเบลบนม้านั่งเอียง | Incline dumbbell press | push | chest |
| db_bench_press | ดันดัมเบลบนม้านั่งราบ | Flat dumbbell bench press | push | chest |
| db_shoulder_press | ดันดัมเบลเหนือหัว (นั่ง) | Seated dumbbell shoulder press | push | chest |
| one_arm_db_row | ดัมเบลโรว์ข้างเดียว (ม้านั่ง) | One-arm dumbbell bench row | pull | back |
| romanian_deadlift | โรมาเนียนเดดลิฟต์ (บาร์เบล) | Barbell Romanian deadlift | legs | legs |
| ez_bar_curl | เคิร์ลบาร์อีซี (ยืน) | Standing EZ-bar curl | pull | arms |
| lying_leg_curl | ไลอิงเลกเคิร์ล (นอนคว่ำ) | Lying leg curl machine | legs | legs |
| hip_thrust_machine | ฮิปทรัสต์ (เครื่อง) | Hip thrust machine | legs | legs |
| hip_abduction | กางสะโพก (เครื่อง) | Hip abduction machine | legs | legs |
| hip_adduction | หุบสะโพก (เครื่อง) | Hip adduction machine | legs | legs |
| glute_kickback | เตะขาด้านหลัง (เครื่อง) | Glute kickback machine | legs | legs |
| seated_calf_raise | ยกน่อง (เครื่องนั่ง) | Seated calf raise machine | legs | legs |
| back_extension | แบ็กเอ็กซ์เทนชัน (ม้านั่งเอียง) | 45-degree back extension bench | pull | back |
| cable_crunch | ครันช์หน้าท้อง (เคเบิล) | Kneeling cable crunch | pull | back |
| leg_raise_station | ยกเข่า (สถานีพยุงแขน) | Vertical knee raise station | pull | back |
| barbell_row | บาร์เบลโรว์ | Bent-over barbell row | pull | back |
