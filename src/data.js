'use strict';
/* 天文数据与轨道力学公式。全部使用国际单位制（米、秒、千克）。 */
const AU = 1.495978707e11, LY = 9.4607304725808e15, PC = 3.0856775814913673e16;
const CLIGHT = 299792458, G0 = 9.80665, DAY = 86400, YEAR = 365.25 * 86400;
const RSUN = 6.957e8, GMSUN = 1.32712440018e20, GME = 3.986004418e14, RE = 6.371e6;
const DEG = Math.PI / 180, OBLIQ = 23.4393 * DEG;   // 黄赤交角
const J2000_UNIX = 946728000;                        // 2000-01-01 12:00 UTC

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };

/* 恒加速度“翻转-减速”航行（brachistochrone），含狭义相对论。
   d: 距离(m)  a: 固有加速度(m/s²)。返回船上时间、地球时间、峰值速度。 */
function travel1g(d, a = G0) {
  const c = CLIGHT;
  const ship = (2 * c / a) * Math.acosh(a * d / (2 * c * c) + 1);
  const earth = Math.sqrt((d / c) * (d / c) + 4 * d / a);
  const vmax = c * Math.tanh(a * ship / (2 * c));
  return { ship, earth, vmax };
}
/* 霍曼转移：同一中心天体的两条圆轨道之间。返回飞行时间与两次点火 Δv。 */
function hohmann(r1, r2, mu) {
  const at = (r1 + r2) / 2;
  const T = Math.PI * Math.sqrt(at * at * at / mu);
  const dv1 = Math.abs(Math.sqrt(mu / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1));
  const dv2 = Math.abs(Math.sqrt(mu / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))));
  return { T, dv1, dv2 };
}

function fmtDist(m) {
  m = Math.abs(m);
  if (m < 1e3) return m.toFixed(m < 10 ? 2 : 0) + ' m';
  if (m < 1e7) return (m / 1e3).toFixed(m < 1e5 ? 2 : 0) + ' km';
  if (m < 0.01 * AU) return (m / 1e7).toFixed(1) + ' 万 km';
  if (m < 2000 * AU) return (m / AU).toFixed(m < 10 * AU ? 3 : 1) + ' AU';
  const ly = m / LY;
  return ly < 1000 ? ly.toFixed(2) + ' 光年' : ly < 1e6 ? (ly / 1e4).toFixed(2) + ' 万光年' : (ly / 1e4).toFixed(0) + ' 万光年';
}
function fmtDur(s) {
  s = Math.abs(s);
  if (s < 120) return s.toFixed(0) + ' 秒';
  if (s < 7200) return (s / 60).toFixed(0) + ' 分钟';
  if (s < 48 * 3600) return (s / 3600).toFixed(1) + ' 小时';
  if (s < 2 * YEAR) return (s / DAY).toFixed(s < 20 * DAY ? 1 : 0) + ' 天';
  const y = s / YEAR;
  return y < 1e4 ? y.toFixed(y < 100 ? 2 : 0) + ' 年' : (y / 1e4).toFixed(1) + ' 万年';
}
function fmtSpeed(v) {
  v = Math.abs(v);
  if (v < 1000) return v.toFixed(v < 10 ? 2 : 0) + ' m/s';
  if (v < 3e6) return (v / 1000).toFixed(v < 1e5 ? 2 : 0) + ' km/s';
  const b = v / CLIGHT;
  return (b * 100).toFixed(b > 0.99 ? 4 : 2) + '% 光速';
}

/* 天体字段：
   kind star|planet|moon   R 半径   GM 引力参数   parent 绕行对象（缺省为系统原点）
   a 轨道半长轴   P 公转周期(天)   L0 J2000 平黄经(°)   tilt 自转轴倾角(°)   rot 自转周期(小时，负为逆行)
   tex 真实贴图   proc 程序生成外观（没有真实影像的天体）   atmo 大气辉光   T 恒星有效温度   lum 光度(太阳=1) */
const SYSTEMS = [
  {
    id: 'sol', name: '太阳系', ra: 0, dec: 0, ly: 0, desc: '我们的家。',
    bodies: [
      { id: 'sun', name: '太阳', kind: 'star', R: RSUN, GM: GMSUN, rot: 609.12, tilt: 7.25, tex: 'sun', T: 5772, lum: 1, sub: 'G2V 黄矮星',
        facts: ['表面有效温度 5772 K，核心约 1570 万 K。', '占太阳系总质量的 99.86%。', '阳光到达地球需要 8 分 19 秒。帕克太阳探测器曾飞到距日面约 8.8 个太阳半径处——本船的停泊轨道也在这个距离。'] },
      { id: 'mercury', name: '水星', kind: 'planet', R: 2.4397e6, GM: 2.2032e13, a: 0.38710 * AU, P: 87.969, L0: 252.25, tilt: 0.03, rot: 1407.6, tex: 'mercury', bump: 8, color: 0x9a8f85, sub: '最靠近太阳的行星',
        facts: ['自转与公转呈 3:2 共振：一个太阳日长达 176 个地球日，正好是两个水星年。', '没有大气保温，昼夜温差从 430°C 到 −180°C。', '永久阴影的极区陨石坑里有水冰。'] },
      { id: 'venus', name: '金星', kind: 'planet', R: 6.0518e6, GM: 3.24859e14, a: 0.72333 * AU, P: 224.701, L0: 181.98, tilt: 177.4, rot: -5832.5, tex: 'venus', gain: 0.85, detail: 0.03, color: 0xe8d9a8, atmo: [0xffe2a0, 0.5], sub: '失控温室效应的样本',
        facts: ['地表约 465°C、92 个大气压，比水星还热。', '逆向自转，且自转一周（243 天）比公转一周（224.7 天）还久。', '你看到的是它的硫酸云顶，可见光下看不到地表。'] },
      { id: 'earth', name: '地球', kind: 'planet', R: RE, GM: GME, a: 1.00000 * AU, P: 365.256, L0: 100.46, tilt: 23.4393, rot: 23.9345, tex: 'earth', detail: 0.07, color: 0x6fa8ff, atmo: [0x5aa8ff, 0.55], sub: '目前已知唯一有生命的世界',
        facts: ['大气层的 99% 都在 30 km 以下——从轨道上看只是地平线上薄薄一条蓝线。', '夜半球的灯光勾勒出海岸线与城市群。', '你脚下的画面是实时的：晨昏线、季节和地球自转都按当前真实日期计算。'] },
      { id: 'moon', name: '月球', kind: 'moon', parent: 'earth', R: 1.7374e6, GM: 4.9028e12, a: 3.844e8, P: 27.3217, L0: 218.32, tilt: 1.54, rot: 655.72, tex: 'moon', bump: 9, eq: false, color: 0xbdbdbd, sub: '地球唯一的天然卫星',
        facts: ['已被潮汐锁定，永远以同一面朝向地球。', '正以每年约 3.8 cm 的速度远离地球。', '1969–1972 年间共有 12 人在月面行走。'] },
      { id: 'mars', name: '火星', kind: 'planet', R: 3.3895e6, GM: 4.2828e13, a: 1.52368 * AU, P: 686.980, L0: 355.45, tilt: 25.19, rot: 24.6229, tex: 'mars', bump: 7, detail: 0.22, color: 0xd9744a, atmo: [0xe8a070, 0.25], sub: '红色行星',
        facts: ['一个火星日（sol）长 24 小时 37 分，自转轴倾角 25.2°，四季分明。', '奥林帕斯山高约 21.9 km，是太阳系已知最高的火山。', '地表气压只有地球的约 0.6%，液态水无法稳定存在。'] },
      { id: 'jupiter', name: '木星', kind: 'planet', R: 6.9911e7, GM: 1.26686534e17, a: 5.2026 * AU, P: 4332.59, L0: 34.40, tilt: 3.13, rot: 9.925, tex: 'jupiter', detail: 0.05, color: 0xd8b48a, atmo: [0xe6c9a0, 0.3], sub: '气态巨行星',
        facts: ['质量是地球的 318 倍，比其余所有行星加起来的两倍还多。', '不到 10 小时自转一周，赤道因此明显鼓起。', '大红斑是一场至少持续了 190 年的反气旋风暴；它的辐射带对电子设备和人都极其危险。'] },
      { id: 'saturn', name: '土星', kind: 'planet', R: 5.8232e7, GM: 3.7931187e16, a: 9.55491 * AU, P: 10759.22, L0: 49.94, tilt: 26.73, rot: 10.656, tex: 'saturn', gain: 0.7, detail: 0.03, ring: [7.45e7, 1.4022e8], color: 0xe3cf9c, atmo: [0xd8c090, 0.2], sub: '带环的气态巨行星',
        facts: ['平均密度 0.687 g/cm³，比水还小。', '主环宽约 28 万 km，厚度却大多只有十米到一千米量级。', '环主要由水冰颗粒组成，大小从尘埃到房屋不等。'] },
      { id: 'uranus', name: '天王星', kind: 'planet', R: 2.5362e7, GM: 5.793939e15, a: 19.2184 * AU, P: 30688.5, L0: 313.23, tilt: 97.77, rot: -17.24, tex: 'uranus', color: 0xa8e0e8, atmo: [0xb0f0f0, 0.35], sub: '冰巨星',
        facts: ['自转轴倾角 97.8°，几乎是“躺着”绕太阳转。', '迄今只有旅行者 2 号在 1986 年飞掠过它。', '大气中的甲烷吸收红光，使它呈青蓝色。'] },
      { id: 'neptune', name: '海王星', kind: 'planet', R: 2.4622e7, GM: 6.836529e15, a: 30.1104 * AU, P: 60182, L0: 304.88, tilt: 28.32, rot: 16.11, tex: 'neptune', color: 0x5a7de8, atmo: [0x6090ff, 0.4], sub: '最远的行星',
        facts: ['1846 年先由数学计算预言位置，再被望远镜找到。', '风速可达约 2100 km/h，是太阳系最快的风。', '公转一周 164.8 年；这里的阳光强度只有地球处的约 1/900。'] },
      // 卫星与矮行星：没有可用的全球影像，外观按已知的颜色和地貌特征程序生成
      { id: 'phobos', name: '火卫一（福波斯）', kind: 'moon', parent: 'mars', eq: true, R: 1.127e4, GM: 7.09e5, a: 9.376e6, P: 0.3189, L0: 20, tilt: 0, rot: 7.654, alt: 2.4e4, proc: { kind: 'rock', seed: 61, pal: [[38, 34, 32], [84, 76, 70], [128, 118, 108]] }, color: 0x8a8078, sub: '火星的小卫星 · 平均半径仅 11 km',
        facts: ['7 小时 39 分绕火星一圈，比火星自转还快——从火星上看它西升东落。', '正以每百年约 1.8 米的速度靠近火星，几千万年后会被潮汐力撕碎或撞上火星。', '实际形状是不规则的“土豆”，这里简化成了球体。'] },
      { id: 'deimos', name: '火卫二（得摩斯）', kind: 'moon', parent: 'mars', eq: true, R: 6.2e3, GM: 9.6e4, a: 2.3463e7, P: 1.2624, L0: 200, tilt: 0, rot: 30.3, alt: 1.5e4, proc: { kind: 'rock', seed: 62, pal: [[60, 54, 48], [110, 100, 90], [150, 140, 128]] }, color: 0x9a9084, sub: '火星的小卫星 · 平均半径约 6 km',
        facts: ['逃逸速度只有约 5.6 m/s，人用力一跳就能飞离它。', '表面覆盖着厚厚的风化层，把大多数陨石坑都填平了。', '实际形状不规则，这里简化成了球体。'] },
      { id: 'ceres', name: '谷神星', kind: 'planet', R: 4.697e5, GM: 6.263e10, a: 2.7675 * AU, P: 1681.6, L0: 153, tilt: 4, rot: 9.074, proc: { kind: 'rock', seed: 63, pal: [[52, 50, 48], [96, 92, 88], [140, 136, 130]] }, color: 0x9a9690, sub: '矮行星 · 小行星带里最大的天体',
        facts: ['占小行星带总质量的约四分之一。', '奥卡托陨石坑里的亮斑是盐类沉积，来自地下卤水。', '曙光号探测器 2015–2018 年环绕它运行。轨道初始相位为近似值。'] },
      { id: 'io', name: '木卫一（艾奥）', kind: 'moon', parent: 'jupiter', eq: true, R: 1.8216e6, GM: 5.9599e12, a: 4.217e8, P: 1.769, L0: 10, tilt: 0, rot: 42.46, proc: { kind: 'lava', seed: 64, pal: [[150, 110, 40], [214, 190, 80], [236, 226, 150]] }, color: 0xe0c860, sub: '太阳系火山活动最剧烈的天体',
        facts: ['木星的潮汐反复揉捏它的内部，产生的热量驱动着 400 多座活火山。', '表面的黄、橙、白色来自硫和二氧化硫霜。', '与木卫二、木卫三保持 4:2:1 的轨道共振。'] },
      { id: 'europa', name: '木卫二（欧罗巴）', kind: 'moon', parent: 'jupiter', eq: true, R: 1.5608e6, GM: 3.2027e12, a: 6.711e8, P: 3.551, L0: 100, tilt: 0, rot: 85.2, proc: { kind: 'ice', seed: 65, pal: [[150, 130, 110], [214, 206, 196], [244, 242, 238]] }, color: 0xe0d8c8, sub: '冰壳之下有全球性海洋',
        facts: ['冰壳下的液态水可能是地球海洋总水量的两倍。', '表面的红褐色条纹是冰壳开裂后涌上来的盐类物质。', '是太阳系里最光滑的天体之一，几乎没有陨石坑。'] },
      { id: 'ganymede', name: '木卫三（盖尼米得）', kind: 'moon', parent: 'jupiter', eq: true, R: 2.6341e6, GM: 9.8878e12, a: 1.0704e9, P: 7.155, L0: 190, tilt: 0, rot: 171.7, proc: { kind: 'rock', seed: 66, pal: [[70, 62, 56], [130, 122, 114], [190, 186, 180]] }, color: 0xa8a098, sub: '太阳系最大的卫星',
        facts: ['比水星还大，是唯一拥有自身磁场的卫星。', '表面分为古老的暗区和布满沟槽的亮区。', '冰层之下同样可能有咸水海洋。'] },
      { id: 'callisto', name: '木卫四（卡利斯托）', kind: 'moon', parent: 'jupiter', eq: true, R: 2.4103e6, GM: 7.1793e12, a: 1.8827e9, P: 16.689, L0: 280, tilt: 0, rot: 400.5, proc: { kind: 'rock', seed: 67, pal: [[36, 32, 30], [76, 68, 62], [150, 144, 136]] }, color: 0x7a7068, sub: '撞击坑最密集的天体之一',
        facts: ['表面约 40 亿年没有被地质活动更新过。', '位于木星主辐射带之外，被认为是载人木星系统任务最合适的基地。', '瓦尔哈拉多环盆地直径约 3800 km。'] },
      { id: 'enceladus', name: '土卫二（恩克拉多斯）', kind: 'moon', parent: 'saturn', eq: true, R: 2.521e5, GM: 7.21e9, a: 2.37948e8, P: 1.370, L0: 60, tilt: 0, rot: 32.9, proc: { kind: 'ice', seed: 68, pal: [[190, 206, 220], [232, 240, 246], [252, 254, 255]] }, color: 0xf0f6ff, sub: '南极喷出水冰羽流的小卫星',
        facts: ['反照率接近 1，是太阳系最“白”的天体。', '南极“虎纹”裂缝喷出的冰粒形成了土星的 E 环。', '卡西尼号在羽流中探测到了盐、有机分子和氢气。'] },
      { id: 'titan', name: '土卫六（泰坦）', kind: 'moon', parent: 'saturn', eq: true, R: 2.5747e6, GM: 8.9781e12, a: 1.22187e9, P: 15.945, L0: 230, tilt: 0, rot: 382.7, proc: { kind: 'gas', seed: 69, pal: [[176, 120, 50], [206, 150, 66], [222, 170, 84]] }, color: 0xd8a050, atmo: [0xe8a040, 0.6], detail: 0.04, sub: '唯一拥有浓厚大气的卫星',
        facts: ['地表气压是地球的 1.45 倍，大气主要是氮气，橙色雾霾来自甲烷光化学产物。', '有甲烷和乙烷构成的河流、湖泊与降雨。', '惠更斯号 2005 年在此着陆，是人类探测器降落过的最远天体。'] },
      { id: 'triton', name: '海卫一（特里同）', kind: 'moon', parent: 'neptune', eq: true, R: 1.3534e6, GM: 1.4276e12, a: 3.54759e8, P: -5.877, L0: 120, tilt: 0, rot: -141, proc: { kind: 'ice', seed: 70, pal: [[150, 140, 136], [214, 196, 190], [240, 232, 228]] }, color: 0xe0d0c8, sub: '逆行公转的大卫星',
        facts: ['公转方向与海王星自转相反，很可能是被俘获的柯伊伯带天体。', '表面约 38 K，却有喷出氮气的间歇泉。', '轨道在缓慢收缩，几十亿年后会被海王星撕碎成环。'] },
      { id: 'pluto', name: '冥王星', kind: 'planet', R: 1.1883e6, GM: 8.696e11, a: 39.482 * AU, P: 90560, L0: 238.93, tilt: 122.5, rot: -153.3, proc: { kind: 'ice', seed: 71, pal: [[110, 80, 60], [196, 170, 140], [240, 232, 220]] }, color: 0xd8c0a0, atmo: [0x90b0ff, 0.2], sub: '矮行星 · 柯伊伯带',
        facts: ['心形的汤博区西半部是一片缓慢对流的氮冰平原。', '公转一周 248 年；这里的阳光强度不到地球处的 1/1500。', '新视野号 2015 年飞掠时发现它有薄薄的蓝色大气霾层。这里按圆轨道近似。'] },
      { id: 'charon', name: '冥卫一（卡戎）', kind: 'moon', parent: 'pluto', eq: true, R: 6.06e5, GM: 1.058e11, a: 1.9591e7, P: 6.387, L0: 0, tilt: 0, rot: 153.3, proc: { kind: 'rock', seed: 72, pal: [[90, 70, 60], [140, 134, 130], [184, 180, 176]] }, color: 0xa8a4a0, sub: '与冥王星互相潮汐锁定',
        facts: ['直径超过冥王星的一半，两者的质心在冥王星体外。', '两个天体永远以同一面相对。', '北极的暗红色区域是从冥王星逃逸过来的物质冻结而成。'] },
    ],
  },
  {
    id: 'proxima', name: '比邻星', ra: 14.4953, dec: -62.6795, ly: 4.2465, desc: '离太阳最近的恒星，一颗会剧烈耀发的红矮星。',
    bodies: [
      { id: 'proxima_s', name: '比邻星', kind: 'star', R: 0.1542 * RSUN, GM: 0.1221 * GMSUN, rot: 2000, tilt: 0, T: 3042, lum: 0.0017, sub: 'M5.5Ve 红矮星',
        facts: ['距太阳 4.2465 光年，是已知最近的恒星。', '质量只有太阳的 12%，光度不到太阳的 0.2%，但寿命可达数万亿年。', '是一颗耀星：亮度会在几分钟内骤增，并喷出强烈的 X 射线。'] },
      { id: 'proxima_d', name: '比邻星 d', kind: 'planet', parent: 'proxima_s', R: 0.81 * RE, GM: 0.26 * GME, a: 0.02885 * AU, P: 5.122, L0: 40, tilt: 0, rot: 122.9, proc: { kind: 'lava', seed: 11, pal: [[40, 28, 26], [92, 60, 48], [140, 100, 80]] }, color: 0xb07050, sub: '亚地球质量行星（视向速度法发现）',
        facts: ['最小质量约 0.26 个地球质量，是视向速度法测到的最轻行星之一。', '5.1 天公转一周，接收到的辐射约为地球的 1.9 倍，太热而不宜居。', '半径和外观尚无观测数据，画面为推测。'] },
      { id: 'proxima_b', name: '比邻星 b', kind: 'planet', parent: 'proxima_s', R: 1.07 * RE, GM: 1.07 * GME, a: 0.04856 * AU, P: 11.186, L0: 200, tilt: 0, rot: 268.5, proc: { kind: 'ocean', seed: 5, pal: [[24, 38, 70], [40, 70, 110], [96, 84, 70], [150, 120, 96]] }, color: 0x7090c0, atmo: [0xff9a70, 0.3], sub: '位于宜居带的岩质行星候选',
        facts: ['最小质量约 1.07 个地球质量，11.2 天公转一周，位于比邻星的宜居带内。', '很可能已被潮汐锁定：一面永昼，一面永夜。', '是否有大气和液态水仍未知——母星的耀发可能早已把大气剥离。画面为艺术想象。'] },
    ],
  },
  {
    id: 'alphacen', name: '半人马座 α（南门二）', ra: 14.6600, dec: -60.8339, ly: 4.344, desc: '离太阳最近的恒星系统，一对互相绕转的类太阳恒星。',
    bodies: [
      { id: 'alphacen_a', name: '半人马座 α A', kind: 'star', R: 1.2175 * RSUN, GM: 1.0788 * GMSUN, a: 10.66 * AU, P: 29133, L0: 0, rot: 528, tilt: 0, T: 5790, lum: 1.519, sub: 'G2V，太阳的“孪生姐妹”',
        facts: ['光谱型与太阳相同（G2V），质量大 8%，亮 52%。', '与 B 星相距 11.2–35.6 AU（平均 23.3 AU），79.8 年互绕一周。', '从这里回望，太阳是仙后座里一颗 0.5 等的亮星。'] },
      { id: 'alphacen_b', name: '半人马座 α B', kind: 'star', R: 0.8591 * RSUN, GM: 0.9092 * GMSUN, a: 12.64 * AU, P: 29133, L0: 180, rot: 984, tilt: 0, T: 5260, lum: 0.5, sub: 'K1V 橙矮星',
        facts: ['比太阳略小、略冷，光度约为太阳的一半。', '目前没有被确认的行星；曾宣布的“Bb”后来被证明是数据假象。', '如果它周围有类地行星，天空中会有另一颗比满月亮上千倍的“第二太阳”。'] },
    ],
  },
  {
    id: 'barnard', name: '巴纳德星', ra: 17.9633, dec: 4.6933, ly: 5.963, desc: '自行最快的恒星，一颗年老的红矮星。',
    bodies: [
      { id: 'barnard_s', name: '巴纳德星', kind: 'star', R: 0.187 * RSUN, GM: 0.162 * GMSUN, rot: 3500, tilt: 0, T: 3195, lum: 0.0035, sub: 'M4V 红矮星',
        facts: ['在天空中每年移动 10.4 角秒，是自行最大的恒星。', '年龄约 70–120 亿年，比太阳老得多。', '2024–2025 年，视向速度观测确认它拥有四颗质量都小于地球的行星。'] },
      { id: 'barnard_d', name: '巴纳德星 d', kind: 'planet', parent: 'barnard_s', R: 0.69 * RE, GM: 0.26 * GME, a: 0.0188 * AU, P: 2.34, L0: 10, tilt: 0, rot: 56.2, proc: { kind: 'rock', seed: 21, pal: [[70, 50, 44], [130, 96, 80], [170, 140, 120]] }, color: 0xa08070, sub: '亚地球行星', facts: ['最小质量约 0.26 个地球质量，2.34 天公转一周。', '离母星太近，表面温度远高于水的沸点。', '半径与外观为推测。'] },
      { id: 'barnard_b', name: '巴纳德星 b', kind: 'planet', parent: 'barnard_s', R: 0.75 * RE, GM: 0.30 * GME, a: 0.0229 * AU, P: 3.154, L0: 130, tilt: 0, rot: 75.7, proc: { kind: 'lava', seed: 22, pal: [[50, 36, 34], [110, 76, 60], [150, 116, 96]] }, color: 0xa87058, sub: '亚地球行星', facts: ['最小质量约 0.30 个地球质量，3.15 天公转一周。', '2024 年由 VLT 的 ESPRESSO 光谱仪发现。', '半径与外观为推测。'] },
      { id: 'barnard_c', name: '巴纳德星 c', kind: 'planet', parent: 'barnard_s', R: 0.78 * RE, GM: 0.34 * GME, a: 0.0274 * AU, P: 4.124, L0: 250, tilt: 0, rot: 99, proc: { kind: 'rock', seed: 23, pal: [[60, 56, 60], [120, 110, 104], [176, 164, 150]] }, color: 0x9c948c, sub: '亚地球行星', facts: ['最小质量约 0.34 个地球质量，4.12 天公转一周。', '四颗行星全部在宜居带内侧，都太热。', '半径与外观为推测。'] },
      { id: 'barnard_e', name: '巴纳德星 e', kind: 'planet', parent: 'barnard_s', R: 0.63 * RE, GM: 0.19 * GME, a: 0.0381 * AU, P: 6.739, L0: 330, tilt: 0, rot: 161.7, proc: { kind: 'rock', seed: 24, pal: [[56, 44, 40], [104, 84, 76], [150, 130, 120]] }, color: 0x907868, sub: '亚地球行星', facts: ['最小质量约 0.19 个地球质量，是视向速度法发现的最轻行星之一。', '6.74 天公转一周。', '半径与外观为推测。'] },
    ],
  },
  {
    id: 'sirius', name: '天狼星', ra: 6.7525, dec: -16.7161, ly: 8.60, desc: '夜空中最亮的恒星，身边藏着一颗白矮星。',
    bodies: [
      { id: 'sirius_a', name: '天狼星 A', kind: 'star', R: 1.711 * RSUN, GM: 2.063 * GMSUN, a: 6.54 * AU, P: 18310, L0: 0, rot: 130, tilt: 0, T: 9940, lum: 25.4, sub: 'A1V 白色主序星',
        facts: ['视星等 −1.46，是地球夜空中最亮的恒星。', '质量约为太阳的 2 倍，光度约 25 倍，表面近 10000 K。', '只有约 2.4 亿岁，却会比太阳更早耗尽燃料。'] },
      { id: 'sirius_b', name: '天狼星 B', kind: 'star', R: 0.0084 * RSUN, GM: 1.018 * GMSUN, a: 13.26 * AU, P: 18310, L0: 180, rot: 1, tilt: 0, T: 25000, lum: 0.026, sub: 'DA2 白矮星',
        facts: ['一颗太阳质量的星体被压缩到地球大小：一茶匙物质重约 5 吨。', '表面温度约 25000 K，但因为太小，光度只有太阳的 2.6%。', '它曾是比 A 星更重的恒星，约 1.2 亿年前演化成白矮星。50.1 年与 A 星互绕一周。'] },
    ],
  },
  {
    id: 'epseri', name: '波江座 ε（天苑四）', ra: 3.5489, dec: -9.4583, ly: 10.47, desc: '一颗年轻的橙矮星，带着尘埃盘和一颗类木行星。',
    bodies: [
      { id: 'epseri_s', name: '波江座 ε', kind: 'star', R: 0.735 * RSUN, GM: 0.82 * GMSUN, rot: 269, tilt: 0, T: 5084, lum: 0.34, sub: 'K2V 橙矮星',
        facts: ['只有 4–8 亿岁，磁活动比太阳剧烈得多。', '周围有小行星带和类似柯伊伯带的尘埃盘。', '1960 年奥兹玛计划——人类第一次搜寻地外文明信号——的两个目标之一。'] },
      { id: 'epseri_b', name: '波江座 ε b（埃吉尔）', kind: 'planet', parent: 'epseri_s', R: 1.0 * 6.9911e7, GM: 0.76 * 1.26686534e17, a: 3.53 * AU, P: 2689, L0: 80, tilt: 12, rot: 11, proc: { kind: 'gas', seed: 31, pal: [[120, 96, 80], [196, 170, 140], [230, 214, 190], [150, 120, 104]] }, color: 0xd0b090, atmo: [0xe0c8a8, 0.3], sub: '类木气态巨行星',
        facts: ['质量约为木星的 0.76 倍，约 7.4 年公转一周。', '轨道半长轴约 3.5 AU，相当于太阳系小行星带的位置。', '半径与云带外观为推测。'] },
    ],
  },
  {
    id: 'tauceti', name: '鲸鱼座 τ（天仓五）', ra: 1.7344, dec: -15.9375, ly: 11.91, desc: '离我们最近的单颗类太阳恒星。',
    bodies: [
      { id: 'tauceti_s', name: '鲸鱼座 τ', kind: 'star', R: 0.793 * RSUN, GM: 0.783 * GMSUN, rot: 816, tilt: 0, T: 5344, lum: 0.52, sub: 'G8V 黄矮星',
        facts: ['金属丰度只有太阳的约三分之一，年龄比太阳更老。', '周围的尘埃盘物质是太阳系的十倍左右，行星可能频繁遭受撞击。', '与波江座 ε 同为奥兹玛计划的目标。'] },
      { id: 'tauceti_e', name: '鲸鱼座 τ e', kind: 'planet', parent: 'tauceti_s', R: 1.65 * RE, GM: 3.93 * GME, a: 0.538 * AU, P: 162.87, L0: 60, tilt: 20, rot: 30, proc: { kind: 'ocean', seed: 41, pal: [[30, 60, 96], [60, 110, 140], [150, 130, 90], [200, 180, 130]] }, color: 0x90b0c8, atmo: [0xa0d0ff, 0.45], sub: '超级地球候选（宜居带内缘）',
        facts: ['最小质量约 3.9 个地球质量，163 天公转一周。', '位于宜居带内缘，更可能像金星而不是地球。', '该行星仍属候选体，尚待进一步确认；半径与外观为推测。'] },
      { id: 'tauceti_f', name: '鲸鱼座 τ f', kind: 'planet', parent: 'tauceti_s', R: 1.65 * RE, GM: 3.93 * GME, a: 1.334 * AU, P: 636.1, L0: 240, tilt: 15, rot: 40, proc: { kind: 'ice', seed: 42, pal: [[120, 150, 176], [190, 214, 230], [240, 246, 250]] }, color: 0xc8dcf0, atmo: [0xc0e0ff, 0.35], sub: '超级地球候选（宜居带外缘）',
        facts: ['最小质量约 3.9 个地球质量，636 天公转一周。', '位于宜居带外缘，进入宜居带的时间可能不足 10 亿年。', '该行星仍属候选体；半径与外观为推测。'] },
    ],
  },
  {
    id: 'trappist1', name: 'TRAPPIST-1', ra: 23.1081, dec: -5.0414, ly: 40.66, desc: '一颗木星大小的超冷矮星，带着七颗地球大小的行星。',
    bodies: [
      { id: 'trappist1_s', name: 'TRAPPIST-1', kind: 'star', R: 0.1192 * RSUN, GM: 0.0898 * GMSUN, rot: 79, tilt: 0, T: 2566, lum: 0.000553, sub: 'M8V 超冷红矮星',
        facts: ['半径只比木星大约 16%，质量却是木星的 94 倍。', '七颗行星的轨道全都挤在比水星轨道小得多的范围内，周期成近共振链。', '站在其中一颗行星上，邻居行星看起来会比地球上的月亮还大。'] },
      ...[['b', 1.5109, 0.01154, 1.116, 1.374, 'lava', '接收的辐射约为地球的 4 倍。韦布望远镜的热辐射观测表明它很可能没有厚大气。'],
          ['c', 2.4219, 0.01580, 1.097, 1.308, 'rock', '韦布望远镜测得昼面约 380 K，排除了金星式的厚二氧化碳大气。'],
          ['d', 4.0492, 0.02227, 0.788, 0.388, 'rock', '质量只有地球的 39%，位于宜居带内缘。'],
          ['e', 6.1010, 0.02925, 0.920, 0.692, 'ocean', '七颗行星中最可能宜居的一颗：密度与地球接近，接收的辐射约为地球的 65%。'],
          ['f', 9.2075, 0.03849, 1.045, 1.039, 'ocean', '质量、半径都与地球几乎相同，位于宜居带中部，可能富含水。'],
          ['g', 12.3524, 0.04683, 1.129, 1.321, 'ice', '七颗中最大的一颗，位于宜居带外缘，密度偏低，可能有厚冰层或水层。'],
          ['h', 18.7729, 0.06189, 0.755, 0.326, 'ice', '最外侧、最小的一颗，表面温度约 170 K，很可能是冰封世界。'],
      ].map(([n, P, a, r, m, kind, fact], i) => ({
        id: 'trappist1_' + n, name: 'TRAPPIST-1 ' + n, kind: 'planet', parent: 'trappist1_s', R: r * RE, GM: m * GME, a: a * AU, P, L0: i * 67, tilt: 0, rot: P * 24,
        proc: { kind, seed: 50 + i, pal: { lava: [[44, 30, 28], [100, 64, 50], [150, 104, 84]], rock: [[80, 64, 56], [140, 116, 100], [184, 164, 150]], ocean: [[20, 44, 80], [44, 84, 120], [110, 96, 80], [160, 140, 120]], ice: [[110, 140, 170], [180, 206, 226], [236, 244, 250]] }[kind] },
        color: { lava: 0xa86850, rock: 0xa89080, ocean: 0x6890b8, ice: 0xc0d8f0 }[kind], atmo: kind === 'ocean' ? [0xff9070, 0.3] : null, sub: `岩质行星 · ${r} 地球半径 · ${m} 地球质量`,
        facts: [`公转周期 ${P} 天，轨道半长轴 ${a} AU。`, fact, '半径和质量由凌星与凌星时间变化精确测得；表面外观为艺术想象。'],
      })),
    ],
  },
];
/* 星图上的参考天体（不可前往）。level：出现在哪一层地图。
   system：太阳系里的深空探测器（ra/dec 方向 + 某日距离 + 远离速度，位置为近似）；galaxy：银河系内（银经 l、银纬 b、距离 ly）；group：本星系群的星系 */
const DEEP = [
  { id: 'v1', level: 'system', name: '旅行者 1 号', kind: 'probe', ra: 258.3, dec: 12.1, au0: 165.5, rate: 3.58, launch: 1977, v: 17.0, note: '1977 年发射，2012 年穿过日球层顶进入星际空间，是离地球最远的人造物体。它的信号要走将近一天才能回到地球。' },
  { id: 'v2', level: 'system', name: '旅行者 2 号', kind: 'probe', ra: 301.2, dec: -59.5, au0: 138.5, rate: 3.22, launch: 1977, v: 15.3, note: '唯一飞掠过天王星和海王星的探测器，2018 年进入星际空间。' },
  { id: 'nh', level: 'system', name: '新视野号', kind: 'probe', ra: 290.0, dec: -20.5, au0: 61.5, rate: 2.9, launch: 2006, v: 13.7, note: '2015 年飞掠冥王星，2019 年飞掠柯伊伯带天体“天涯海角”（Arrokoth）。' },
  { id: 'sgra', level: 'galaxy', name: '人马座 A*（银河系中心黑洞）', kind: 'bh', l: 359.944, b: -0.046, ly: 26670, note: '约 430 万倍太阳质量的超大质量黑洞。2022 年事件视界望远镜公布了它的第一张照片。周围的恒星以每秒上千公里的速度绕它旋转。' },
  { id: 'm45', level: 'galaxy', name: '昴星团（M45）', kind: 'cluster', l: 166.57, b: -23.52, ly: 444, note: '肉眼可见的年轻疏散星团，约 1 亿岁，成员星上千颗。中国古称“昴宿”。' },
  { id: 'betel', level: 'galaxy', name: '参宿四', kind: 'star', l: 199.79, b: -8.96, ly: 548, note: '一颗红超巨星，半径约为太阳的 760 倍——放在太阳的位置上会吞没到木星轨道附近。它会在未来约十万年内爆发为超新星。距离仍有较大不确定性。' },
  { id: 'm42', level: 'galaxy', name: '猎户座大星云（M42）', kind: 'nebula', l: 209.01, b: -19.38, ly: 1344, note: '离地球最近的大型恒星形成区，肉眼可见，位于猎户座腰带下方的“剑”上。' },
  { id: 'crab', level: 'galaxy', name: '蟹状星云（M1）', kind: 'nebula', l: 184.56, b: -5.78, ly: 6500, note: '1054 年超新星爆发的遗迹，《宋会要》记载它“昼见如太白”，白天可见 23 天。中心是一颗每秒自转 30 圈的脉冲星。' },
  { id: 'cygx1', level: 'galaxy', name: '天鹅座 X-1', kind: 'bh', l: 71.33, b: 3.07, ly: 7200, note: '第一个被普遍确认的恒星级黑洞，约 21 倍太阳质量，正在吞食伴星的物质。' },
  { id: 'etacar', level: 'galaxy', name: '船底座 η', kind: 'star', l: 287.6, b: -0.63, ly: 7500, note: '银河系最亮、最重的恒星之一，1840 年代曾突然爆发成全天第二亮星。随时可能成为超新星。' },
  { id: 'omegacen', level: 'galaxy', name: '半人马座 ω 星团', kind: 'cluster', l: 309.1, b: 14.97, ly: 17700, note: '银河系最大的球状星团，约 1000 万颗恒星，很可能是一个被银河系吞并的矮星系的残核。' },
  { id: 'sgrdsph', level: 'group', name: '人马座矮椭球星系', kind: 'dwarf', l: 5.6, b: -14.2, ly: 70000, size: 10000, note: '正在被银河系潮汐撕碎、吞并的卫星星系，它的恒星流已经绕了银河系好几圈。' },
  { id: 'lmc', level: 'group', name: '大麦哲伦云', kind: 'irregular', l: 280.47, b: -32.89, ly: 163000, size: 32000, note: '银河系最大的卫星星系，南半球肉眼可见。1987 年那里的一颗超新星（SN 1987A）是近代离我们最近的超新星爆发。' },
  { id: 'smc', level: 'group', name: '小麦哲伦云', kind: 'irregular', l: 302.8, b: -44.3, ly: 200000, size: 19000, note: '和大麦哲伦云一起绕银河系运动，两者之间有一条气体“桥”相连。' },
  { id: 'leo1', level: 'group', name: '狮子座 I', kind: 'dwarf', l: 225.99, b: 49.11, ly: 820000, size: 2000, note: '离银河系最远的卫星星系之一。' },
  { id: 'ngc6822', level: 'group', name: '巴纳德星系（NGC 6822）', kind: 'irregular', l: 25.34, b: -18.4, ly: 1600000, size: 7000, note: '本星系群里的一个不规则矮星系，由巴纳德（发现巴纳德星的同一位天文学家）于 1884 年发现。' },
  { id: 'm31', level: 'group', name: '仙女座星系（M31）', kind: 'spiral', l: 121.17, b: -21.57, ly: 2537000, size: 152000, incl: 77, pa: 38, note: '本星系群最大的星系，约有一万亿颗恒星，肉眼可见的最远天体之一。它正以约 110 km/s 的速度接近银河系，约 45 亿年后两者可能碰撞并合并。' },
  { id: 'm33', level: 'group', name: '三角座星系（M33）', kind: 'spiral', l: 133.61, b: -31.33, ly: 2730000, size: 61000, incl: 55, pa: 23, note: '本星系群第三大星系，可能是仙女座星系的卫星星系。' },
];
