/* ============================================================
   BedTrack — Simulation engine
   Emergency scenario definitions + patient/name generators.
   ============================================================ */
'use strict';

(function () {
  // ---------- Generators ----------
  const FIRST_M = ['Kwame', 'Kojo', 'Yaw', 'Kofi', 'Samuel', 'Daniel', 'Michael', 'Joseph', 'Emmanuel', 'Isaac', 'David', 'Nana', 'Ibrahim', 'Yusuf', 'Mohammed', 'Alex', 'James', 'Peter', 'Eric', 'Kwesi'];
  const FIRST_F = ['Ama', 'Akua', 'Abena', 'Efua', 'Sarah', 'Grace', 'Mary', 'Janet', 'Mercy', 'Fatima', 'Aisha', 'Hannah', 'Esther', 'Linda', 'Patience', 'Comfort', 'Gifty', 'Rose', 'Esi', 'Adjoa'];
  const LAST = ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Osei', 'Appiah', 'Agyemang', 'Addo', 'Tetteh', 'Quartey', 'Amoah', 'Darko', 'Ofori', 'Ankrah', 'Larbi', 'Sarpong', 'Baidoo', 'Nkrumah', 'Acheampong', 'Frimpong'];

  const COND = {
    trauma: ['Head trauma', 'Internal bleeding', 'Fractured femur', 'Chest trauma', 'Spinal injury', 'Pelvic fracture', 'Severe lacerations', 'Pneumothorax', 'Crush injury', 'Open fracture'],
    ortho: ['Broken arm', 'Broken leg', 'Dislocated shoulder', 'Sprained ankle', 'Wrist fracture', 'Rib fractures', 'Knee injury', 'Hip fracture'],
    burn: ['2nd-degree burns', '3rd-degree burns', 'Smoke inhalation', 'Burn shock', 'Airway burn', 'Chemical burns'],
    cardiac: ['Cardiac arrest', 'Heart attack (MI)', 'Arrhythmia', 'Acute heart failure', 'Unstable angina', 'Hypertensive crisis'],
    resp: ['Severe pneumonia', 'Respiratory failure', 'Asthma attack', 'Bronchitis', 'Suspected virus', 'High fever', 'Dehydration'],
    neuro: ['Stroke (CVA)', 'Seizure', 'Concussion', 'Migraine crisis', 'Altered consciousness', 'Head injury'],
    peds: ['Asthma attack', 'Febrile seizure', 'Croup', 'Severe dehydration', 'Bronchiolitis', 'Allergic reaction', 'Head bump'],
    obst: ['Labour pains', 'Pre-eclampsia', 'Post-partum bleeding', 'Pregnancy complications', 'Premature labour'],
    minor: ['Minor cuts', 'Sprains', 'Bruises', 'Mild hypothermia', 'Small wounds', 'Anxiety/shock', 'Insect bites'],
    psych: ['Acute panic attack', 'Psychotic episode', 'Self-harm risk', 'Substance overdose'],
  };

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function randomName(sex) {
    const first = sex === 'F' ? pick(FIRST_F) : pick(FIRST_M);
    return first + ' ' + pick(LAST);
  }

  function patient(sex, age, condition, triage, needs) {
    sex = sex || (Math.random() < 0.5 ? 'M' : 'F');
    return {
      name: randomName(sex),
      sex: sex,
      age: age,
      condition: condition,
      triage: triage,          // red | yellow | green | black
      needs: needs,            // ward id: ER | ICU | GEN | MAT | PED | SUR | ISO
    };
  }

  // ---------- Scenario builder helpers ----------
  // A scenario build() returns a list of arrivals:
  //   { delay: secondsFromStart, patient: {...} }
  function wave(patients, startSec, gapSec) {
    return patients.map(function (p, i) {
      return { delay: startSec + i * gapSec + Math.random() * (gapSec * 0.6), patient: p };
    });
  }

  // ============================================================
  // SCENARIOS
  // ============================================================
  const SCENARIOS = [
    {
      id: 'mva', icon: '🚗', name: 'Multi-vehicle accident',
      tag: 'Road traffic collision',
      desc: 'Highway collision with 8 casualties. Mixed triage: head trauma, fractures and internal injuries arrive over 45 seconds.',
      build: function () {
        const out = [];
        out.push(patient('M', rand(25, 55), 'Head trauma', 'red', 'ICU'));
        out.push(patient('F', rand(20, 60), 'Internal bleeding', 'red', 'SUR'));
        out.push(patient('M', rand(30, 70), 'Chest trauma', 'red', 'ICU'));
        out.push(patient('F', rand(18, 45), 'Fractured femur', 'yellow', 'SUR'));
        out.push(patient('M', rand(25, 65), 'Broken arm', 'yellow', 'GEN'));
        out.push(patient('F', rand(20, 50), 'Whiplash & bruises', 'green', 'GEN'));
        out.push(patient('M', rand(35, 80), 'Rib fractures', 'yellow', 'GEN'));
        out.push(patient('F', rand(20, 40), 'Minor cuts', 'green', 'ER'));
        return wave(out, 3, 5);
      },
    },
    {
      id: 'mci', icon: '🚨', name: 'Mass casualty incident',
      tag: 'MCI — Level 3',
      desc: 'A major incident floods the hospital with 20 casualties. Expect overflow: many beds will fill and patients will queue.',
      build: function () {
        const out = [];
        const kinds = [
          ['red', 'ICU'], ['red', 'SUR'], ['red', 'ICU'], ['yellow', 'GEN'], ['yellow', 'ER'],
          ['green', 'ER'], ['red', 'SUR'], ['yellow', 'GEN'], ['green', 'GEN'], ['red', 'ICU'],
          ['yellow', 'ER'], ['green', 'ER'], ['red', 'SUR'], ['yellow', 'GEN'], ['green', 'GEN'],
          ['red', 'ICU'], ['yellow', 'ER'], ['green', 'ER'], ['yellow', 'GEN'], ['black', 'GEN'],
        ];
        const conds = ['Head trauma', 'Internal bleeding', 'Chest trauma', 'Fractured femur', 'Severe lacerations', 'Spinal injury', 'Crush injury', 'Open fracture', 'Pneumothorax', 'Burn shock'];
        kinds.forEach(function (k) {
          out.push(patient(null, rand(16, 75), pick(conds), k[0], k[1]));
        });
        return wave(out, 2, 3);
      },
    },
    {
      id: 'fire', icon: '🔥', name: 'Building fire',
      tag: 'Structure fire',
      desc: 'Apartment block fire. Burns and smoke inhalation cases need ICU and ER care.',
      build: function () {
        const out = [];
        out.push(patient('M', rand(30, 60), 'Smoke inhalation', 'red', 'ICU'));
        out.push(patient('F', rand(25, 50), '3rd-degree burns', 'red', 'ICU'));
        out.push(patient(null, rand(5, 12), 'Smoke inhalation', 'red', 'PED'));
        out.push(patient('F', rand(20, 65), '2nd-degree burns', 'yellow', 'ER'));
        out.push(patient('M', rand(25, 70), 'Airway burn', 'red', 'ICU'));
        out.push(patient('F', rand(30, 80), 'Burn shock', 'red', 'ICU'));
        out.push(patient('M', rand(18, 55), 'Chemical burns', 'yellow', 'ER'));
        out.push(patient('F', rand(20, 45), 'Anxiety/shock', 'green', 'ER'));
        out.push(patient('M', rand(40, 85), 'Smoke inhalation', 'yellow', 'GEN'));
        out.push(patient('F', rand(25, 60), '2nd-degree burns', 'yellow', 'ER'));
        return wave(out, 3, 4);
      },
    },
    {
      id: 'outbreak', icon: '🦠', name: 'Disease outbreak',
      tag: 'Infectious cluster',
      desc: 'A cluster of high-fever respiratory cases arrives. Isolation beds are required to contain the spread.',
      build: function () {
        const out = [];
        for (let i = 0; i < 14; i++) {
          const sev = i < 3 ? 'red' : (i < 8 ? 'yellow' : 'green');
          out.push(patient(null, rand(10, 80), pick(COND.resp), sev, 'ISO'));
        }
        return wave(out, 2, 5);
      },
    },
    {
      id: 'cardiac', icon: '❤️', name: 'Cardiac emergency wave',
      tag: 'Code Blue series',
      desc: 'Back-to-back cardiac emergencies demand ICU capacity fast.',
      build: function () {
        const out = [];
        out.push(patient('M', rand(50, 85), 'Cardiac arrest', 'red', 'ICU'));
        out.push(patient('M', rand(45, 80), 'Heart attack (MI)', 'red', 'ICU'));
        out.push(patient('F', rand(55, 85), 'Acute heart failure', 'red', 'ICU'));
        out.push(patient('M', rand(40, 75), 'Arrhythmia', 'yellow', 'ICU'));
        out.push(patient('F', rand(50, 80), 'Unstable angina', 'yellow', 'ER'));
        out.push(patient('M', rand(60, 90), 'Hypertensive crisis', 'yellow', 'GEN'));
        return wave(out, 2, 8);
      },
    },
    {
      id: 'disaster', icon: '🌊', name: 'Storm & flooding',
      tag: 'Natural disaster',
      desc: 'Flood victims stream in: hypothermia, cuts, sprains and drowning cases.',
      build: function () {
        const out = [];
        const kinds = [
          ['red', 'ICU', 'Near-drowning'], ['yellow', 'GEN', 'Mild hypothermia'], ['green', 'ER', 'Minor cuts'],
          ['yellow', 'GEN', 'Sprained ankle'], ['green', 'ER', 'Small wounds'], ['red', 'ICU', 'Respiratory failure'],
          ['yellow', 'ER', 'Dehydration'], ['green', 'GEN', 'Bruises'], ['yellow', 'GEN', 'Hip fracture'],
          ['green', 'ER', 'Insect bites'], ['red', 'SUR', 'Crush injury'], ['yellow', 'ER', 'Wrist fracture'],
          ['green', 'GEN', 'Anxiety/shock'], ['yellow', 'GEN', 'Rib fractures'], ['green', 'ER', 'Mild hypothermia'],
          ['yellow', 'ER', 'Severe lacerations'],
        ];
        kinds.forEach(function (k) {
          out.push(patient(null, rand(8, 80), k[2], k[0], k[1]));
        });
        return wave(out, 2, 4);
      },
    },
    {
      id: 'trauma', icon: '🔪', name: 'Trauma surge',
      tag: 'Penetrating trauma',
      desc: 'Violent trauma cases: stab wounds and assaults requiring surgery and ICU.',
      build: function () {
        const out = [];
        const conds = ['Stab wound', 'Chest trauma', 'Internal bleeding', 'Head trauma', 'Pneumothorax', 'Severe lacerations'];
        const kinds = [['red', 'SUR'], ['red', 'ICU'], ['yellow', 'SUR'], ['red', 'ICU'], ['yellow', 'ER'], ['red', 'SUR'], ['yellow', 'GEN']];
        kinds.forEach(function (k) {
          out.push(patient(Math.random() < 0.8 ? 'M' : 'F', rand(16, 55), pick(conds), k[0], k[1]));
        });
        return wave(out, 2, 5);
      },
    },
    {
      id: 'peds', icon: '🧸', name: 'Pediatric surge',
      tag: 'Children’s emergency',
      desc: 'Children arrive with asthma, seizures and fevers — pediatric beds needed.',
      build: function () {
        const out = [];
        for (let i = 0; i < 7; i++) {
          const sev = i < 2 ? 'red' : (i < 4 ? 'yellow' : 'green');
          out.push(patient(null, rand(1, 13), pick(COND.peds), sev, 'PED'));
        }
        return wave(out, 2, 5);
      },
    },
    {
      id: 'surge', icon: '⚡', name: 'Full-scale surge (stress test)',
      tag: 'Capacity stress test',
      desc: 'The ultimate test: 26 patients arrive in 90 seconds across every triage level. Watch the hospital fill up.',
      build: function () {
        const out = [];
        const pools = [COND.trauma, COND.ortho, COND.cardiac, COND.resp, COND.neuro, COND.minor];
        const wards = ['ER', 'ICU', 'GEN', 'SUR', 'ISO', 'PED', 'MAT'];
        for (let i = 0; i < 26; i++) {
          const r = Math.random();
          const triage = r < 0.3 ? 'red' : (r < 0.65 ? 'yellow' : 'green');
          const cond = pick(pools[i % pools.length]);
          let needs = pick(wards);
          if (triage === 'red' && Math.random() < 0.6) needs = Math.random() < 0.5 ? 'ICU' : 'SUR';
          out.push(patient(null, rand(5, 85), cond, triage, needs));
        }
        return wave(out, 1, 3.2);
      },
    },
    {
      id: 'trickle', icon: '🚑', name: 'Rolling ambulances',
      tag: 'Continuous stream',
      desc: 'A steady drip of ambulances over 2 minutes — mixed everyday emergencies.',
      build: function () {
        const out = [];
        const pools = [COND.trauma, COND.ortho, COND.cardiac, COND.resp, COND.neuro, COND.psych, COND.minor];
        const wards = ['ER', 'ICU', 'GEN', 'SUR', 'ISO', 'PED'];
        for (let i = 0; i < 10; i++) {
          const r = Math.random();
          const triage = r < 0.2 ? 'red' : (r < 0.55 ? 'yellow' : 'green');
          out.push(patient(null, rand(16, 88), pick(pools[i % pools.length]), triage, pick(wards)));
        }
        return wave(out, 4, 11);
      },
    },
    {
      id: 'obst', icon: '🤰', name: 'Maternity emergency',
      tag: 'Obstetric emergency',
      desc: 'Obstetric emergencies arrive at once — maternity beds and surgery required.',
      build: function () {
        const out = [];
        out.push(patient('F', rand(19, 42), 'Pre-eclampsia', 'red', 'MAT'));
        out.push(patient('F', rand(18, 40), 'Premature labour', 'yellow', 'MAT'));
        out.push(patient('F', rand(20, 38), 'Labour pains', 'green', 'MAT'));
        out.push(patient('F', rand(22, 44), 'Post-partum bleeding', 'red', 'SUR'));
        out.push(patient('F', rand(19, 41), 'Pregnancy complications', 'yellow', 'MAT'));
        out.push(patient('F', rand(21, 39), 'Labour pains', 'green', 'MAT'));
        return wave(out, 2, 6);
      },
    },
    {
      id: 'psych', icon: '🧠', name: 'Mental health crisis',
      tag: 'Behavioral emergency',
      desc: 'Psychiatric and overdose cases arrive, needing safe beds and observation.',
      build: function () {
        const out = [];
        out.push(patient(null, rand(18, 60), 'Psychotic episode', 'yellow', 'GEN'));
        out.push(patient(null, rand(16, 45), 'Substance overdose', 'red', 'ER'));
        out.push(patient(null, rand(20, 55), 'Acute panic attack', 'green', 'ER'));
        out.push(patient(null, rand(18, 50), 'Self-harm risk', 'yellow', 'GEN'));
        out.push(patient(null, rand(25, 65), 'Substance overdose', 'yellow', 'ER'));
        return wave(out, 2, 7);
      },
    },
  ];

  // ---------- Public API ----------
  window.SIMUTIL = {
    pick: pick,
    rand: rand,
    randomName: randomName,
    patient: patient,
    COND: COND,
    FIRST_M: FIRST_M,
    FIRST_F: FIRST_F,
    LAST: LAST,
  };
  window.SCENARIOS = SCENARIOS;
})();
