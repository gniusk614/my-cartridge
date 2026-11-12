import { createEpisode, createMap } from './core.js';

// Fictional, replaceable template. No actual names, dates or family photographs.
export function createBirthdayEpisode() {
  const p = createEpisode(); p.meta = { title: '너에게로 가는 길', locale: 'ko-KR', duration_minutes: 6 };
  p.characters[0].name = '당신'; p.characters[0].appearance = { skin: '#f4cdb3', hair: '#443345', coat: '#d9919c', pants: '#47445d', scarf: '#f4d697', hair_style: 'long' };
  p.characters[1].name = '남편'; p.characters[1].appearance = { skin: '#e8b998', hair: '#283244', coat: '#59899c', pants: '#343449', scarf: '#c6d9ce', hair_style: 'short' };
  const scenes = [
    { title: '품 안의 작은 온기', place: '낯선 길', theme: 'garden', intro: '눈을 뜨니 낯선 길이다. 품에는 작은 아이가 잠들어 있다.\n{{missing}}: 집까지 같이 가자. 내가 옆에 있을게.\n이동하며 바이러스를 물리치고, 빛나는 물건을 살펴보자.', hints: [['작은 양말', '아이의 작은 양말 사이에서 사진 조각을 발견했다.', '사진 가장자리에는 오래된 꽃무늬 담요가 보인다.'], ['낯익은 딸랑이', '딸랑이 밑에 두 번째 사진 조각이 있다.', '{{player}}: 이 모양… 어디선가 본 것 같아.']] },
    { title: '어디선가 본 놀이터', place: '오래된 놀이터', theme: 'sunset', intro: '길은 오래된 놀이터로 이어진다. 아이는 여전히 편안히 잠들어 있다.\n{{player}}: 처음 온 곳인데… 왠지 익숙해.\n{{missing}}: 기억나는 게 있으면 천천히 살펴봐.', hints: [['오래된 인형', '낡은 인형 곁에 사진 조각이 끼워져 있다.', '누군가 오래도록 소중히 안고 다녔던 인형이다.'], ['꽃무늬 벽지', '오래된 집 사진의 모서리를 찾았다.', '{{player}}: 이 벽지… 기억나. 어릴 때 어디서 봤더라?']] },
    { title: '마지막 문 앞에서', place: '기억 속 집', theme: 'winter_street', intro: '따뜻한 불빛이 새어 나오는 집 앞이다. 커다란 그림자가 문을 가로막는다.\n{{missing}}: 여기까지 잘 왔어. 마지막도 함께 가자.\n그림자의 긴 준비 동작을 보고 피한 뒤 공격하자.', hints: [['접힌 사진 조각', '그림자가 지키던 조각을 찾았다.', '사진 속 아이의 담요가 품 안의 담요와 닮았다.'], ['마지막 사진 조각', '이제 모든 조각을 찾았다. 집 안의 액자를 완성할 수 있다.', '{{missing}}: 저 문 안에 네가 만나야 할 사람이 있어.']] },
  ];
  p.maps = []; p.chapters = []; p.clues = [];
  scenes.forEach((s, i) => {
    const n = i + 1, id = `journey_${n}`, m = createMap(`journey_map_${n}`, s.theme); m.name = s.place; m.width = 720; m.door = { x: 672, y: 130 }; m.surfaces = [{ id: `step_${n}`, x: 285, y: 104, width: 44, depth: 16, height: 16 }];
    m.npcs = [{ character_id: 'companion', position: { x: 90, y: 150 }, text: i === 0 ? '천천히 가자. 내가 옆에 있을게.' : '괜찮아. 우리 같이 가자. 빛나는 물건도 살펴봐.' }];
    const e1 = `${id}_virus`, e2 = `${id}_guard`, g1 = `${id}_first`, g2 = `${id}_clear`, gate = `${id}_arrival`;
    const enemies = [{ id: e1, type: 'street_thug', visual: 'virus', position: { x: 205, y: 130 }, trigger_x: 145, after: [] }, { id: e2, type: i === 2 ? 'bruiser' : 'street_thug', visual: i === 2 ? 'shadow' : 'virus', max_hp: i === 2 ? 100 : 35, position: { x: 465, y: 130 }, trigger_x: 380, after: [e1], event_id: gate }];
    const goals = [{ id: g1, type: 'defeat_count', target: 'street_thug', count: 1, depends_on: [], position: { x: 260, y: 130 } }, { id: g2, type: 'defeat_count', target: i === 2 ? 'bruiser' : 'street_thug', count: i === 2 ? 1 : 2, depends_on: [], position: { x: 570, y: 130 } }];
    s.hints.forEach(([name, text, memory], j) => { const clue = `${id}_photo_${j + 1}`; p.clues.push({ id: clue, name, text, memory, asset_key: 'clue_photo' }); goals.push({ id: `${clue}_goal`, type: 'collect_clue', target: clue, count: 1, depends_on: [j === 0 ? g1 : g2], position: { x: j === 0 ? 270 : 580, y: 137 } }); });
    p.maps.push(m); p.chapters.push({ id, title: s.title, intro: s.intro, template: 'winter_street', map_id: m.id, mechanics: ['brawler', 'collect'], exit_mode: 'direct', carry_baby: true, companion_id: 'companion', enemies, objectives: goals, events: [
      { id: gate, title: i === 2 ? '문을 지키는 그림자' : '함께 걷는 길', text: i === 2 ? '{{missing}}: 준비하는 순간이 길어. 그때 거리를 벌리고, 공격이 끝나면 다가가자.' : '{{missing}}: 앞에도 바이러스가 보여. 조심해, 내가 여기 있을게.', trigger: { type: 'reach_x', x: 360 }, after: [], speaker_id: 'companion', heal: 0 },
      { id: `${id}_warmth`, title: '작은 온기', text: '품 안의 아이가 손을 꼭 쥔다. 마음이 조금 가벼워졌다.\n보호 체력 18 회복.', trigger: { type: 'clue_collected', target: `${id}_photo_1` }, after: [], heal: 18 },
    ] });
  });
  p.ending = { music_asset_key: 'demo_ending', letter: '태어나줘서 고마워, {{player}}.\n\n사진 속 작은 아이가 자라서 나와 만나고, 함께 웃고, 이제는 우리 아이를 품에 안고 있네.\n\n올해 우리는 정말 큰 행복을 만났지. 그 행복을 함께 키우느라 우리 자신을 잠시 뒤로 미루는 날도 많아졌고.\n\n오늘은 네가 얼마나 소중한 사람인지 꼭 말해 주고 싶었어. 네가 웃는 시간도, 네가 좋아하는 것들도 우리 함께 소중히 지켜 가자.\n\n생일 축하해. 오늘의 주인공은 너야.\n사랑해.', photo_reveal: { clue_ids: p.clues.map(c => c.id), subject: '{{player}}', date: '당신이 태어난 날', reveal_text: '{{missing}}: 이 아이가 자라서…\n내가 가장 사랑하는 사람이 됐어.' } };
  return p;
}
