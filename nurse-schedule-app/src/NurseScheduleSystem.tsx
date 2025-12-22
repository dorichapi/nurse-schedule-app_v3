import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Settings, Moon, Sun, Clock, RefreshCw, AlertCircle, CheckCircle, Plus, Trash2, LogOut, Lock, Download, Upload, Edit2, Save, X, Eye, Users, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';

// ============================================
// 定数定義
// ============================================

const POSITIONS = {
  師長: { name: '師長', color: 'bg-rose-100 text-rose-700 border-rose-200', priority: 1 },
  主任: { name: '主任', color: 'bg-amber-100 text-amber-700 border-amber-200', priority: 2 },
  副主任: { name: '副主任', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', priority: 3 },
  一般: { name: '一般', color: 'bg-slate-100 text-slate-600 border-slate-200', priority: 4 }
};

const SHIFT_TYPES = {
  日: { name: '日勤', hours: 7.5, color: 'bg-blue-100 text-blue-700' },
  早: { name: '早出', hours: 7.5, color: 'bg-sky-100 text-sky-700' },
  遅: { name: '遅出', hours: 7.5, color: 'bg-indigo-100 text-indigo-700' },
  夜: { name: '夜勤', hours: 14.5, color: 'bg-purple-100 text-purple-700' },
  明: { name: '夜明', hours: 0, color: 'bg-pink-100 text-pink-700' },
  休: { name: '公休', hours: 0, color: 'bg-gray-100 text-gray-600' },
  有: { name: '有休', hours: 0, color: 'bg-emerald-100 text-emerald-700' }
};

const STORAGE_KEYS = {
  NURSES: 'nurse_schedule_nurses',
  REQUESTS: 'nurse_schedule_requests',
  SCHEDULE: 'nurse_schedule_data',
  MONTH: 'nurse_schedule_month'
};

// ============================================
// ユーティリティ関数
// ============================================

// 固定アクセスコード生成（ID + 名前から常に同じコードを生成）
const generateFixedAccessCode = (id, name) => {
  let hash = 0;
  const str = `${id}-${name}-nurse2025`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const code = Math.abs(hash % 900000) + 100000;
  return String(code);
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const getDayOfWeek = (year, month, day) => {
  const d = new Date(year, month, day);
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
};

const isWeekend = (year, month, day) => {
  const d = new Date(year, month, day);
  return d.getDay() === 0 || d.getDay() === 6;
};

// ============================================
// メインコンポーネント
// ============================================

const NurseScheduleSystem = () => {
  // システムモード: 'select' | 'admin' | 'staff'
  const [systemMode, setSystemMode] = useState('select');
  
  // 管理者認証
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  
  // 職員認証
  const [staffNurseId, setStaffNurseId] = useState(null);
  const [staffCode, setStaffCode] = useState('');
  const [staffError, setStaffError] = useState('');
  
  // 対象年月
  const [targetYear, setTargetYear] = useState(2025);
  const [targetMonth, setTargetMonth] = useState(11); // 12月（0始まり）
  
  // 看護師データ（localStorage永続化）
  const [nurses, setNurses] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.NURSES);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('看護師データ読み込みエラー:', e);
      }
    }
    // 初期サンプルデータ
    return [
      { id: 1, name: '佐藤 美咲', position: '師長', active: true },
      { id: 2, name: '鈴木 結衣', position: '主任', active: true },
      { id: 3, name: '高橋 陽菜', position: '副主任', active: true },
      { id: 4, name: '田中 葵', position: '一般', active: true },
      { id: 5, name: '伊藤 凛', position: '一般', active: true },
    ];
  });
  
  // 休み希望データ（localStorage永続化）
  const [requests, setRequests] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REQUESTS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('希望データ読み込みエラー:', e);
      }
    }
    return {};
  });
  
  // 勤務表データ
  const [schedule, setSchedule] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('勤務表データ読み込みエラー:', e);
      }
    }
    return null;
  });
  
  // UI状態
  const [showSettings, setShowSettings] = useState(false);
  const [showRequestReview, setShowRequestReview] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [showAccessCodes, setShowAccessCodes] = useState(false);
  const [editingNurse, setEditingNurse] = useState(null);
  const [showAddNurse, setShowAddNurse] = useState(false);
  const [newNurseData, setNewNurseData] = useState({ name: '', position: '一般' });
  const [generating, setGenerating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // 削除確認用
  const [showGenerateConfig, setShowGenerateConfig] = useState(false); // 生成設定モーダル
  
  // 勤務表生成設定
  const [generateConfig, setGenerateConfig] = useState({
    nightShiftPattern: [3, 4], // 週ごとの夜勤人数パターン（交互）
    startWithThree: true, // 第1週を3人から開始
    maxNightShifts: 6, // 個人の最大夜勤回数
    minDaysOff: 8, // 最小休日数
    maxConsecutiveDays: 5, // 最大連続勤務日数
    // 日勤者数設定
    weekdayDayStaff: 10, // 平日の日勤者数
    weekendDayStaff: 8, // 土日の日勤者数
    yearEndDayStaff: 7, // 年末（12/30-31）の日勤者数
    newYearDayStaff: 7  // 年始（1/1-3）の日勤者数
  });
  
  // 前月データ関連（確定済み）
  const [previousMonthData, setPreviousMonthData] = useState(null); // { nurseId: [最後7日分のシフト] }
  const [prevMonthConstraints, setPrevMonthConstraints] = useState({}); // { nurseId: { day: shift } }
  
  // 前月データ関連（プレビュー用）
  const [showPrevMonthImport, setShowPrevMonthImport] = useState(false);
  const [showPrevMonthReview, setShowPrevMonthReview] = useState(false);
  const [prevMonthRawData, setPrevMonthRawData] = useState([]); // Excelから読み込んだ生データ [{name, shifts}]
  const [prevMonthMapping, setPrevMonthMapping] = useState({}); // { nurseId: excelRowIndex } マッピング
  
  // Excel読み込み用
  const [excelData, setExcelData] = useState(null);
  const [excelPreview, setExcelPreview] = useState([]);
  const [importConfig, setImportConfig] = useState({
    startRow: 2,
    endRow: 30,
    nameColumn: 'C',
    positionColumn: 'D'
  });

  // データ永続化（保存）
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.NURSES, JSON.stringify(nurses));
  }, [nurses]);
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
  }, [requests]);
  
  useEffect(() => {
    if (schedule) {
      localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
    }
  }, [schedule]);

  // 他タブでのlocalStorage変更を検知してstateを同期
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEYS.REQUESTS) {
        try {
          const saved = e.newValue;
          if (saved) {
            setRequests(JSON.parse(saved));
          }
        } catch (err) {
          console.error('希望データ同期エラー:', err);
        }
      }
      if (e.key === STORAGE_KEYS.NURSES) {
        try {
          const saved = e.newValue;
          if (saved) {
            setNurses(JSON.parse(saved));
          }
        } catch (err) {
          console.error('看護師データ同期エラー:', err);
        }
      }
      if (e.key === STORAGE_KEYS.SCHEDULE) {
        try {
          const saved = e.newValue;
          if (saved) {
            setSchedule(JSON.parse(saved));
          }
        } catch (err) {
          console.error('勤務表データ同期エラー:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 計算値
  const activeNurses = useMemo(() => 
    nurses.filter(n => n.active).sort((a, b) => 
      (POSITIONS[a.position]?.priority || 99) - (POSITIONS[b.position]?.priority || 99)
    ), [nurses]);
  
  const daysInMonth = getDaysInMonth(targetYear, targetMonth);
  
  // 各看護師にアクセスコードを付与
  const nursesWithCodes = useMemo(() => 
    activeNurses.map(n => ({
      ...n,
      accessCode: generateFixedAccessCode(n.id, n.name)
    })), [activeNurses]);

  // ============================================
  // 管理者機能
  // ============================================

  const handleAdminLogin = () => {
    if (adminPassword === 'admin123') {
      setIsAdminAuth(true);
      setAdminError('');
    } else {
      setAdminError('パスワードが正しくありません');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuth(false);
    setAdminPassword('');
    setSystemMode('select');
  };

  const addNurse = () => {
    if (!newNurseData.name.trim()) {
      alert('氏名を入力してください');
      return;
    }
    const newId = Math.max(...nurses.map(n => n.id), 0) + 1;
    setNurses([...nurses, {
      id: newId,
      name: newNurseData.name.trim(),
      position: newNurseData.position,
      active: true
    }]);
    setShowAddNurse(false);
    setNewNurseData({ name: '', position: '一般' });
  };

  const updateNurse = (id, updates) => {
    setNurses(nurses.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const deleteNurse = (id) => {
    if (activeNurses.length <= 1) {
      alert('最低1名の看護師が必要です');
      return;
    }
    // 完全削除
    setNurses(nurses.filter(n => n.id !== id));
  };

  // Excel読み込み
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
        
        setExcelData(jsonData);
        updateExcelPreview(jsonData, importConfig);
        setShowExcelImport(true);
      } catch (error) {
        alert('Excelファイルの読み込みに失敗しました: ' + error.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const columnToIndex = (col) => {
    let index = 0;
    for (let i = 0; i < col.length; i++) {
      index = index * 26 + (col.charCodeAt(i) - 64);
    }
    return index - 1;
  };

  const updateExcelPreview = (data, config) => {
    if (!data) return;
    
    const preview = [];
    const nameColIndex = columnToIndex(config.nameColumn);
    const posColIndex = columnToIndex(config.positionColumn);
    
    for (let i = config.startRow - 1; i < Math.min(config.endRow, data.length); i++) {
      const row = data[i];
      if (row && row[nameColIndex]) {
        const name = String(row[nameColIndex]).trim();
        if (name) {
          preview.push({
            row: i + 1,
            name: name,
            position: row[posColIndex] ? String(row[posColIndex]).trim() : '一般'
          });
        }
      }
    }
    
    setExcelPreview(preview);
  };

  const applyExcelImport = () => {
    if (excelPreview.length === 0) {
      alert('読み込むデータがありません');
      return;
    }

    const newNurses = excelPreview.map((item, index) => {
      let position = '一般';
      const posStr = (item.position || '').replace(/\s+/g, '');
      
      if (posStr.includes('師長')) position = '師長';
      else if (posStr.includes('主任') && !posStr.includes('副')) position = '主任';
      else if (posStr.includes('副主任') || (posStr.includes('副') && posStr.includes('主任'))) position = '副主任';
      
      return {
        id: index + 1,
        name: item.name,
        active: true,
        position: position
      };
    });

    setNurses(newNurses);
    setShowExcelImport(false);
    setExcelData(null);
    setExcelPreview([]);
    alert(`✅ ${newNurses.length}名の看護師情報を読み込みました`);
  };

  // ============================================
  // 前月勤務表読み込み機能
  // ============================================
  
  // 前月勤務表のExcel読み込み
  const handlePrevMonthUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // 前月末7日分のデータを抽出（配列形式）
        const rawData = extractPreviousMonthDataAsArray(jsonData);
        
        if (rawData.length > 0) {
          setPrevMonthRawData(rawData);
          
          // 自動マッピングを試みる
          const autoMapping = createAutoMapping(rawData);
          setPrevMonthMapping(autoMapping);
          
          setShowPrevMonthImport(false);
          setShowPrevMonthReview(true);
        } else {
          alert('前月データを抽出できませんでした。フォーマットを確認してください。');
        }
      } catch (error) {
        console.error('前月データ読み込みエラー:', error);
        alert('Excelファイルの読み込みに失敗しました');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // 自動マッピングを作成（名前の類似度で紐付け）
  const createAutoMapping = (rawData) => {
    const mapping = {};
    
    activeNurses.forEach((nurse, nurseIndex) => {
      // まず名前でマッチを試みる
      let bestMatch = -1;
      let bestScore = 0;
      
      rawData.forEach((row, rowIndex) => {
        const score = calculateNameSimilarity(nurse.name, row.name);
        if (score > bestScore && score > 0.3) { // 30%以上の類似度
          bestScore = score;
          bestMatch = rowIndex;
        }
      });
      
      // マッチが見つからない場合、行番号順で割り当て
      if (bestMatch === -1 && nurseIndex < rawData.length) {
        bestMatch = nurseIndex;
      }
      
      if (bestMatch !== -1) {
        mapping[nurse.id] = bestMatch;
      }
    });
    
    return mapping;
  };

  // 名前の類似度を計算（簡易版）
  const calculateNameSimilarity = (name1, name2) => {
    if (!name1 || !name2) return 0;
    
    const n1 = normalizeName(name1).replace(/\s/g, '');
    const n2 = normalizeName(name2).replace(/\s/g, '');
    
    if (n1 === n2) return 1;
    
    // 部分一致
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;
    
    // 文字の一致率
    const chars1 = new Set(n1);
    const chars2 = new Set(n2);
    const intersection = [...chars1].filter(c => chars2.has(c)).length;
    const union = new Set([...chars1, ...chars2]).size;
    
    return intersection / union;
  };

  // マッピングを変更
  const updateMapping = (nurseId, excelRowIndex) => {
    setPrevMonthMapping(prev => ({
      ...prev,
      [nurseId]: excelRowIndex === '' ? undefined : parseInt(excelRowIndex)
    }));
  };

  // 前月データを確定
  const confirmPreviousMonthData = () => {
    if (prevMonthRawData.length === 0) return;
    
    // マッピングに基づいてデータを作成
    const confirmedData = {};
    activeNurses.forEach(nurse => {
      const rowIndex = prevMonthMapping[nurse.id];
      if (rowIndex !== undefined && prevMonthRawData[rowIndex]) {
        confirmedData[nurse.id] = prevMonthRawData[rowIndex].shifts;
      }
    });
    
    setPreviousMonthData(confirmedData);
    
    // 制約を計算
    const constraints = calculateConstraintsFromData(confirmedData);
    setPrevMonthConstraints(constraints);
    
    // プレビュー状態をクリア
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    setShowPrevMonthReview(false);
    
    alert('✅ 前月データを確定しました。「自動生成」で制約が適用されます。');
  };

  // プレビューをキャンセル
  const cancelPreviousMonthPreview = () => {
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
    setShowPrevMonthReview(false);
  };

  // 前月末7日分のデータを配列として抽出
  const extractPreviousMonthDataAsArray = (jsonData) => {
    const result = [];
    
    if (jsonData.length < 2) return result;
    
    // ヘッダー行と列構造を検出
    let headerRowIndex = 0;
    let nameColIndex = 1; // デフォルトは列B
    let dataStartCol = 2; // デフォルトは列C
    let dataEndCol = -1;
    
    // 最初の10行からヘッダー行を探す
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row || row.length < 3) continue;
      
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').trim().toLowerCase();
        
        // 氏名列を探す
        if (cell === 'name' || cell.includes('氏名') || cell.includes('名前') || 
            cell === 'スタッフ' || cell === '看護師' || cell === '職員') {
          nameColIndex = j;
          headerRowIndex = i;
        }
        
        // 日付列を探す（Excelシリアル値）
        const numVal = Number(row[j]);
        if (!isNaN(numVal) && numVal > 43000 && numVal < 50000) {
          if (dataStartCol === 2 || j < dataStartCol) dataStartCol = j;
          dataEndCol = Math.max(dataEndCol, j);
        }
      }
    }
    
    if (dataEndCol === -1) {
      dataEndCol = jsonData[0] ? jsonData[0].length - 1 : 31;
    }
    
    // データ行を処理
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row) continue;
      
      const name = String(row[nameColIndex] || '').trim();
      if (!name || name.includes('合計') || name.includes('計') || name === 'ID' || name === 'Name') continue;
      
      // 最後の7日分を取得
      const totalDays = dataEndCol - dataStartCol + 1;
      const startDay = Math.max(0, totalDays - 7);
      const shifts = [];
      
      for (let d = startDay; d < totalDays; d++) {
        const colIndex = dataStartCol + d;
        const shift = String(row[colIndex] || '').trim();
        shifts.push(normalizeShift(shift));
      }
      
      if (shifts.some(s => s)) {
        result.push({ name, shifts, rowIndex: result.length });
      }
    }
    
    return result;
  };

  // 確定済みデータから制約を計算
  const calculateConstraintsFromData = (confirmedData) => {
    const constraints = {};
    
    activeNurses.forEach(nurse => {
      const shifts = confirmedData[nurse.id];
      if (!shifts || shifts.length === 0) return;
      
      const lastShift = shifts[shifts.length - 1];
      const secondLastShift = shifts.length > 1 ? shifts[shifts.length - 2] : '';
      const thirdLastShift = shifts.length > 2 ? shifts[shifts.length - 3] : '';
      
      constraints[nurse.id] = {};
      
      // 前月末が「夜勤」の場合
      if (lastShift === '夜') {
        constraints[nurse.id][0] = '明';
        constraints[nurse.id][1] = '休';
        if (thirdLastShift === '夜' && secondLastShift === '明') {
          constraints[nurse.id][2] = '休';
        }
      }
      // 前月末が「夜勤明け」の場合
      else if (lastShift === '明') {
        constraints[nurse.id][0] = '休';
        if (secondLastShift === '夜') {
          if (shifts.length >= 4 && shifts[shifts.length - 4] === '夜' && shifts[shifts.length - 3] === '明') {
            constraints[nurse.id][1] = '休';
          }
        }
      }
      
      // 連続勤務日数をチェック
      let consecutiveWork = 0;
      for (let i = shifts.length - 1; i >= 0; i--) {
        const s = shifts[i];
        if (s && s !== '休' && s !== '有' && s !== '明') {
          consecutiveWork++;
        } else {
          break;
        }
      }
      
      if (consecutiveWork >= 4 && !constraints[nurse.id][0]) {
        constraints[nurse.id][0] = '休';
      }
    });
    
    return constraints;
  };
  // 氏名を正規化（スペースの統一）
  const normalizeName = (name) => {
    if (!name) return '';
    // 全角スペース→半角スペース、連続スペース→単一スペース、前後のスペース削除
    return name.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // シフト記号を正規化
  const normalizeShift = (shift) => {
    if (!shift) return '';
    const s = shift.trim();
    if (s === '日' || s === '日勤' || s === 'D') return '日';
    if (s === '夜' || s === '夜勤' || s === 'N') return '夜';
    if (s === '明' || s === '夜明' || s === '夜勤明' || s === 'A') return '明';
    if (s === '休' || s === '公休' || s === '公' || s === 'O') return '休';
    if (s === '有' || s === '有休' || s === '有給' || s === 'Y') return '有';
    if (s === '早' || s === '早出') return '早';
    if (s === '遅' || s === '遅出') return '遅';
    // nanや空白も休み扱い
    if (s === 'nan' || s === 'NaN') return '休';
    return s;
  };

  // 前月データをクリア
  const clearPreviousMonthData = () => {
    setPreviousMonthData(null);
    setPrevMonthConstraints({});
    setPrevMonthRawData([]);
    setPrevMonthMapping({});
  };

  // 勤務表自動生成（本格版）
  const generateSchedule = () => {
    setGenerating(true);
    setShowGenerateConfig(false);
    
    setTimeout(() => {
      const monthKey = `${targetYear}-${targetMonth}`;
      const holidays = []; // 祝日リスト（必要に応じて設定）
      
      // 週ごとの夜勤人数を計算（月曜〜日曜ベース）
      const getWeeklyNightStaff = () => {
        const weeks = [];
        const firstDay = new Date(targetYear, targetMonth, 1);
        const firstDayOfWeek = firstDay.getDay(); // 0=日, 1=月, ...
        
        // 月の1日が含まれる週の月曜日を計算
        let currentDay = 1;
        let weekIndex = 0;
        
        // 第1週（月初から最初の日曜日まで）
        const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
        if (daysUntilSunday > 0) {
          const nightCount = generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1];
          weeks.push({
            startDay: 1,
            endDay: Math.min(daysUntilSunday, daysInMonth),
            count: nightCount,
            weekNum: 1
          });
          currentDay = daysUntilSunday + 1;
          weekIndex = 1;
        }
        
        // 残りの週（月曜〜日曜）
        while (currentDay <= daysInMonth) {
          const patternIndex = generateConfig.startWithThree ? (weekIndex % 2) : ((weekIndex + 1) % 2);
          const nightCount = generateConfig.nightShiftPattern[patternIndex];
          const endDay = Math.min(currentDay + 6, daysInMonth);
          
          weeks.push({
            startDay: currentDay,
            endDay: endDay,
            count: nightCount,
            weekNum: weekIndex + 1
          });
          
          currentDay = endDay + 1;
          weekIndex++;
        }
        
        return weeks;
      };
      
      const weeklyNightStaff = getWeeklyNightStaff();
      console.log('週ごとの夜勤設定:', weeklyNightStaff);
      
      // 設定値
      const config = {
        maxNightShifts: generateConfig.maxNightShifts,
        minDaysOff: generateConfig.minDaysOff,
        maxConsecutiveNights: 2,
        maxConsecutiveDays: generateConfig.maxConsecutiveDays,
        beds: 35,
        ratio: 7,
        weeklyNightStaff: weeklyNightStaff
      };

      const isWeekendOrHoliday = (day) => {
        const date = new Date(targetYear, targetMonth, day + 1);
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6 || holidays.includes(day + 1);
      };

      const isSunday = (day) => {
        const date = new Date(targetYear, targetMonth, day + 1);
        return date.getDay() === 0;
      };

      // 年末年始判定
      const isYearEnd = (day) => {
        // 12月30日、31日
        return targetMonth === 11 && (day + 1 === 30 || day + 1 === 31);
      };

      const isNewYear = (day) => {
        // 1月1日、2日、3日
        return targetMonth === 0 && (day + 1 >= 1 && day + 1 <= 3);
      };

      // 日勤者数の要件を取得
      const getDayStaffRequirement = (day) => {
        if (isYearEnd(day)) return generateConfig.yearEndDayStaff;
        if (isNewYear(day)) return generateConfig.newYearDayStaff;
        if (isWeekendOrHoliday(day)) return generateConfig.weekendDayStaff;
        return generateConfig.weekdayDayStaff;
      };

      const getNightRequirement = (dayIndex) => {
        const day = dayIndex + 1;
        for (const period of config.weeklyNightStaff) {
          if (day >= period.startDay && day <= period.endDay) {
            return period.count;
          }
        }
        return 3;
      };

      // 休み希望を取得
      const existingRequests = {};
      activeNurses.forEach(nurse => {
        existingRequests[nurse.id] = {};
        const nurseRequests = requests[monthKey]?.[String(nurse.id)] || {};
        Object.entries(nurseRequests).forEach(([day, value]) => {
          existingRequests[nurse.id][parseInt(day) - 1] = value;
        });
      });

      // 候補生成関数
      const generateCandidate = (seed) => {
        const newSchedule = {};
        const stats = {};
        
        const targetDaysOff = 9;
        const targetWorkDays = 21;
        
        // 役職別の看護師リスト
        const headNurse = activeNurses.find(n => n.position === '師長');
        const chiefNurses = activeNurses.filter(n => n.position === '主任');
        const deputyNurses = activeNurses.filter(n => n.position === '副主任');
        const managementNurses = [...chiefNurses, ...deputyNurses];

        // 初期化
        activeNurses.forEach(nurse => {
          newSchedule[nurse.id] = Array(daysInMonth).fill(null);
          stats[nurse.id] = { 
            nightCount: 0, 
            dayWorkCount: 0, 
            daysOff: 0,
            totalWork: 0,
            weekendWork: 0,
            consecutiveDays: 0
          };
          
          // ★★★ 前月データに基づく制約を最優先で適用（1〜3日目）★★★
          if (prevMonthConstraints[nurse.id]) {
            const constraints = prevMonthConstraints[nurse.id];
            for (const [dayStr, shift] of Object.entries(constraints)) {
              const day = parseInt(dayStr);
              if (day < daysInMonth) {
                newSchedule[nurse.id][day] = shift;
                if (shift === '休' || shift === '有') {
                  stats[nurse.id].daysOff++;
                } else if (shift === '夜') {
                  stats[nurse.id].nightCount++;
                  stats[nurse.id].totalWork++;
                } else if (shift !== '明') {
                  stats[nurse.id].totalWork++;
                }
              }
            }
          }
          
          // 既存の休み希望をコピー（前月制約で埋まっていない日のみ）
          if (existingRequests[nurse.id]) {
            for (let day = 0; day < daysInMonth; day++) {
              if (newSchedule[nurse.id][day]) continue; // 前月制約で埋まっている
              const existingShift = existingRequests[nurse.id][day];
              if (existingShift === '休' || existingShift === '有') {
                newSchedule[nurse.id][day] = existingShift;
                stats[nurse.id].daysOff++;
              }
            }
          }
        });

        // 休み希望がない場合、ランダムに休日を配置（4日目以降のみ）
        activeNurses.forEach((nurse, idx) => {
          const currentDaysOff = stats[nurse.id].daysOff;
          if (currentDaysOff < targetDaysOff) {
            const offDays = new Set();
            let attempts = 0;
            while (offDays.size < (targetDaysOff - currentDaysOff) && attempts < 100) {
              const rng = seed + idx * 7919 + attempts * 997;
              // 前月制約がある場合は4日目以降からランダム配置
              const minDay = Object.keys(prevMonthConstraints).length > 0 ? 3 : 0;
              const day = minDay + Math.floor((Math.abs(Math.sin(rng) * 10000)) % (daysInMonth - minDay));
              if (!newSchedule[nurse.id][day]) {
                offDays.add(day);
              }
              attempts++;
            }
            
            offDays.forEach(day => {
              newSchedule[nurse.id][day] = '休';
              stats[nurse.id].daysOff++;
            });
          }
        });

        // 各日のシフト割り当て
        for (let day = 0; day < daysInMonth; day++) {
          const isSpecialDay = isWeekendOrHoliday(day);
          const sundayFlag = isSunday(day);
          const dayRequirement = getDayStaffRequirement(day); // 日勤者数要件を取得
          
          // 夜勤割り当て
          const availableForNight = activeNurses.filter(nurse => {
            if (newSchedule[nurse.id][day]) return false;
            if (stats[nurse.id].nightCount >= config.maxNightShifts) return false;
            if (day + 1 < daysInMonth && newSchedule[nurse.id][day + 1] && newSchedule[nurse.id][day + 1] !== '明') return false;
            if (day > 0 && newSchedule[nurse.id][day - 1] === '夜') {
              if (day > 1 && newSchedule[nurse.id][day - 2] === '夜') return false;
            }
            if (stats[nurse.id].consecutiveDays >= config.maxConsecutiveDays) return false;
            return true;
          }).sort((a, b) => {
            const aNight = stats[a.id].nightCount;
            const bNight = stats[b.id].nightCount;
            if (aNight !== bNight) return aNight - bNight;
            if (isSpecialDay) {
              return stats[a.id].weekendWork - stats[b.id].weekendWork;
            }
            return stats[a.id].totalWork - stats[b.id].totalWork;
          });
          
          const nightStaff = availableForNight.slice(0, getNightRequirement(day));
          nightStaff.forEach(nurse => {
            newSchedule[nurse.id][day] = '夜';
            stats[nurse.id].nightCount++;
            stats[nurse.id].totalWork++;
            stats[nurse.id].consecutiveDays++;
            if (isSpecialDay) stats[nurse.id].weekendWork++;
            
            // 夜勤明けを設定
            if (day + 1 < daysInMonth && !newSchedule[nurse.id][day + 1]) {
              newSchedule[nurse.id][day + 1] = '明';
              stats[nurse.id].consecutiveDays = 0;
              
              // 夜勤明けの翌日は休み
              if (day + 2 < daysInMonth && !newSchedule[nurse.id][day + 2]) {
                newSchedule[nurse.id][day + 2] = '休';
                stats[nurse.id].daysOff++;
              }
            }
          });

          // 日勤割り当て
          const availableForDay = activeNurses.filter(nurse => {
            if (newSchedule[nurse.id][day]) return false;
            if (stats[nurse.id].consecutiveDays >= config.maxConsecutiveDays) return false;
            if (sundayFlag && nurse.position === '師長') return false;
            return true;
          }).sort((a, b) => {
            if (isSpecialDay) {
              const weekendDiff = stats[a.id].weekendWork - stats[b.id].weekendWork;
              if (weekendDiff !== 0) return weekendDiff;
            }
            return stats[a.id].totalWork - stats[b.id].totalWork;
          });
          
          const dayStaff = availableForDay.slice(0, dayRequirement);
          dayStaff.forEach(nurse => {
            newSchedule[nurse.id][day] = '日';
            stats[nurse.id].dayWorkCount++;
            stats[nurse.id].totalWork++;
            stats[nurse.id].consecutiveDays++;
            if (isSpecialDay) stats[nurse.id].weekendWork++;
          });
          
          // 師長が休みの日は主任・副主任が出勤しているかチェック
          if (headNurse) {
            const headShift = newSchedule[headNurse.id][day];
            if (headShift === '休' || headShift === '有') {
              const managementWorking = managementNurses.some(n => 
                newSchedule[n.id][day] === '日' || newSchedule[n.id][day] === '早' || newSchedule[n.id][day] === '遅'
              );
              if (!managementWorking) {
                const availableManagement = managementNurses.find(n => 
                  !newSchedule[n.id][day] && stats[n.id].consecutiveDays < config.maxConsecutiveDays
                );
                if (availableManagement) {
                  newSchedule[availableManagement.id][day] = '日';
                  stats[availableManagement.id].dayWorkCount++;
                  stats[availableManagement.id].totalWork++;
                  stats[availableManagement.id].consecutiveDays++;
                  if (isSpecialDay) stats[availableManagement.id].weekendWork++;
                }
              }
            }
          }
          
          // 休日で連続勤務リセット
          activeNurses.forEach(nurse => {
            const shift = newSchedule[nurse.id][day];
            if (shift === '休' || shift === '有') {
              stats[nurse.id].consecutiveDays = 0;
            }
          });
        }

        // 空きセルを埋める
        activeNurses.forEach(nurse => {
          let consecutiveWork = 0;
          for (let day = 0; day < daysInMonth; day++) {
            if (!newSchedule[nurse.id][day]) {
              const needsWork = stats[nurse.id].totalWork < targetWorkDays - 2;
              const needsRest = stats[nurse.id].daysOff < targetDaysOff - 2;
              const tooManyConsecutive = consecutiveWork >= config.maxConsecutiveDays;
              const shouldRest = consecutiveWork >= 4;
              const sundayFlag = isSunday(day);
              const canWorkDay = !(sundayFlag && nurse.position === '師長');
              
              if (tooManyConsecutive || shouldRest || (!needsWork && consecutiveWork >= 3)) {
                newSchedule[nurse.id][day] = '休';
                stats[nurse.id].daysOff++;
                consecutiveWork = 0;
              } else if (needsWork && canWorkDay) {
                newSchedule[nurse.id][day] = '日';
                stats[nurse.id].totalWork++;
                consecutiveWork++;
                if (isWeekendOrHoliday(day)) stats[nurse.id].weekendWork++;
              } else if (needsRest || !canWorkDay) {
                newSchedule[nurse.id][day] = '休';
                stats[nurse.id].daysOff++;
                consecutiveWork = 0;
              } else {
                if (consecutiveWork >= 2 || Math.random() > 0.6) {
                  newSchedule[nurse.id][day] = '休';
                  stats[nurse.id].daysOff++;
                  consecutiveWork = 0;
                } else if (canWorkDay) {
                  newSchedule[nurse.id][day] = '日';
                  stats[nurse.id].totalWork++;
                  consecutiveWork++;
                  if (isWeekendOrHoliday(day)) stats[nurse.id].weekendWork++;
                } else {
                  newSchedule[nurse.id][day] = '休';
                  stats[nurse.id].daysOff++;
                  consecutiveWork = 0;
                }
              }
            } else {
              const shift = newSchedule[nurse.id][day];
              if (shift === '休' || shift === '有' || shift === '明') {
                consecutiveWork = 0;
              } else {
                consecutiveWork++;
              }
            }
          }
        });

        return { schedule: newSchedule, stats };
      };

      // スコア計算関数
      const calculateScore = (schedule, stats) => {
        let score = 1000;
        
        activeNurses.forEach(nurse => {
          const shifts = schedule[nurse.id];
          const stat = stats[nurse.id];
          
          // 勤務日数バランス
          const targetWork = 21;
          const workDiff = Math.abs(stat.totalWork - targetWork);
          score -= workDiff * workDiff * 3;
          
          // 休日数バランス
          const targetOff = 9;
          const offDiff = Math.abs(stat.daysOff - targetOff);
          score -= offDiff * offDiff * 3;
          
          // 連続勤務チェック
          let consecutive = 0;
          let maxConsecutive = 0;
          for (let i = 0; i < shifts.length; i++) {
            if (shifts[i] && shifts[i] !== '休' && shifts[i] !== '有' && shifts[i] !== '明') {
              consecutive++;
              maxConsecutive = Math.max(maxConsecutive, consecutive);
            } else {
              consecutive = 0;
            }
          }
          
          if (maxConsecutive > config.maxConsecutiveDays) {
            score -= Math.pow(maxConsecutive - config.maxConsecutiveDays, 2) * 100;
          }
          
          // 夜勤回数
          const targetNights = 5;
          const nightDiff = Math.abs(stat.nightCount - targetNights);
          score -= nightDiff * nightDiff * 4;
          
          // 夜勤後の夜勤明けチェック
          for (let i = 0; i < shifts.length - 1; i++) {
            if (shifts[i] === '夜' && shifts[i + 1] !== '明') {
              score -= 50;
            }
          }
        });
        
        return score;
      };

      // 複数の候補を生成して最良を選択
      const candidates = [];
      for (let i = 0; i < 5; i++) {
        const candidate = generateCandidate(i * 12345 + Date.now());
        const score = calculateScore(candidate.schedule, candidate.stats);
        candidates.push({ ...candidate, score });
      }

      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];

      // 配列形式に変換（1-indexed から 0-indexed の配列に）
      const finalSchedule = {};
      activeNurses.forEach(nurse => {
        finalSchedule[nurse.id] = best.schedule[nurse.id];
      });

      setSchedule({ month: monthKey, data: finalSchedule });
      setGenerating(false);
    }, 1500);
  };

  // Excel出力
  const exportToExcel = () => {
    if (!schedule) {
      alert('勤務表が生成されていません');
      return;
    }

    const wb = XLSX.utils.book_new();
    const scheduleData = [
      [`${targetYear}年${targetMonth + 1}月 勤務表`],
      ['氏名', '役職', ...Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`)]
    ];

    activeNurses.forEach(nurse => {
      const shifts = schedule.data[nurse.id] || [];
      scheduleData.push([nurse.name, nurse.position, ...shifts.map(s => s || '-')]);
    });

    const ws = XLSX.utils.aoa_to_sheet(scheduleData);
    XLSX.utils.book_append_sheet(wb, ws, '勤務表');

    const fileName = `勤務表_${targetYear}年${targetMonth + 1}月_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // アクセスコード一覧をコピー
  const copyAllCodes = () => {
    const codes = nursesWithCodes.map(n => 
      `${n.name}（${n.position}）: ${n.accessCode}`
    ).join('\n');
    navigator.clipboard.writeText(codes).then(() => {
      alert('全員分のアクセスコードをコピーしました');
    });
  };

  // ============================================
  // 職員機能
  // ============================================

  const handleStaffLogin = () => {
    const nurse = nursesWithCodes.find(n => n.accessCode === staffCode);
    if (nurse) {
      setStaffNurseId(nurse.id);
      setStaffError('');
    } else {
      setStaffError('アクセスコードが正しくありません');
    }
  };

  const handleStaffLogout = () => {
    setStaffNurseId(null);
    setStaffCode('');
    setSystemMode('select');
  };

  const updateRequest = (day, value) => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const nurseIdKey = String(staffNurseId);
    setRequests(prev => {
      const monthRequests = { ...(prev[monthKey] || {}) };
      const nurseRequests = { ...(monthRequests[nurseIdKey] || {}) };
      
      if (value) {
        nurseRequests[day] = value;
      } else {
        delete nurseRequests[day];
      }
      
      monthRequests[nurseIdKey] = nurseRequests;
      return { ...prev, [monthKey]: monthRequests };
    });
  };

  const getOtherRequestsCount = (day) => {
    const monthKey = `${targetYear}-${targetMonth}`;
    const monthRequests = requests[monthKey] || {};
    const myIdKey = String(staffNurseId);
    let count = 0;
    Object.entries(monthRequests).forEach(([nurseIdKey, reqs]) => {
      if (nurseIdKey !== myIdKey && reqs[day]) {
        count++;
      }
    });
    return count;
  };

  // ============================================
  // 画面レンダリング
  // ============================================

  // システム選択画面
  if (systemMode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-lg border border-white/50">
          <div className="text-center mb-10">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-2xl inline-block mb-5 shadow-lg">
              <Calendar className="text-white" size={56} />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">看護師勤務表システム</h1>
            <p className="text-gray-500">{targetYear}年{targetMonth + 1}月</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setSystemMode('admin')}
              className="w-full px-6 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              <Lock size={24} />
              管理者ログイン
            </button>
            
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-sm text-gray-500">または</span>
              </div>
            </div>
            
            <button
              onClick={() => setSystemMode('staff')}
              className="w-full px-6 py-5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              <Users size={24} />
              職員用（休み希望入力）
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-8">
            データはブラウザに保存されます
          </p>
        </div>
      </div>
    );
  }

  // 管理者ログイン画面
  if (systemMode === 'admin' && !isAdminAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-md border border-white/50">
          <button
            onClick={() => setSystemMode('select')}
            className="mb-6 text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <Lock className="text-white" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">管理者ログイン</h1>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                placeholder="管理者パスワード"
              />
            </div>
            
            {adminError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {adminError}
              </div>
            )}
            
            <button
              onClick={handleAdminLogin}
              className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              ログイン
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl">
            <p>デモ用パスワード: <code className="bg-gray-200 px-2 py-0.5 rounded">admin123</code></p>
          </div>
        </div>
      </div>
    );
  }

  // 職員ログイン画面
  if (systemMode === 'staff' && !staffNurseId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 flex items-center justify-center p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl p-10 w-full max-w-md border border-white/50">
          <button
            onClick={() => setSystemMode('select')}
            className="mb-6 text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ← 戻る
          </button>
          
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <Users className="text-white" size={40} />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">休み希望入力</h1>
            <p className="text-gray-500 mt-2">{targetYear}年{targetMonth + 1}月</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">アクセスコード（6桁）</label>
              <input
                type="text"
                value={staffCode}
                onChange={(e) => {
                  setStaffCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6));
                  setStaffError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && staffCode.length === 6 && handleStaffLogin()}
                className="w-full px-4 py-4 border-2 border-gray-200 rounded-xl text-center text-3xl font-mono tracking-widest focus:border-emerald-500 focus:outline-none transition-colors"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            
            {staffError && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {staffError}
              </div>
            )}
            
            <button
              onClick={handleStaffLogin}
              disabled={staffCode.length !== 6}
              className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              入力画面へ
            </button>
          </div>

          <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-xl">
            <p>アクセスコードは管理者から配布されます</p>
          </div>
        </div>
      </div>
    );
  }

  // 職員用休み希望入力画面
  if (systemMode === 'staff' && staffNurseId) {
    const nurse = nursesWithCodes.find(n => n.id === staffNurseId);
    if (!nurse) {
      setStaffNurseId(null);
      return null;
    }

    const monthKey = `${targetYear}-${targetMonth}`;
    const myIdKey = String(staffNurseId);
    const myRequests = requests[monthKey]?.[myIdKey] || {};
    const requestCount = Object.keys(myRequests).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 p-4 md:p-6">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">{nurse.name}さん</h1>
                <p className="text-gray-500">{targetYear}年{targetMonth + 1}月の休み希望入力</p>
              </div>
              <button
                onClick={handleStaffLogout}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors self-start"
              >
                <LogOut size={18} />
                終了
              </button>
            </div>
          </div>

          {/* 入力状況 */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-emerald-100 p-3 rounded-xl">
                  <Calendar className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">入力済み希望</p>
                  <p className="text-2xl font-bold text-emerald-600">{requestCount}日</p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('入力した希望をすべてクリアしますか？')) {
                    setRequests(prev => {
                      const updated = { ...prev };
                      if (updated[monthKey]) {
                        delete updated[monthKey][myIdKey];
                      }
                      return updated;
                    });
                  }
                }}
                className="text-sm text-red-500 hover:text-red-700 transition-colors"
              >
                すべてクリア
              </button>
            </div>
          </div>

          {/* 操作説明 */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-800">
              <strong>操作方法：</strong>日付をタップすると「公休」→「有休」→「クリア」と切り替わります。
              <br />
              <span className="text-emerald-600">青いバッジ</span>は他の職員の希望人数です。
            </p>
          </div>

          {/* カレンダー */}
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-4 md:p-6 border border-white/50">
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
              {['日', '月', '火', '水', '木', '金', '土'].map((day, i) => (
                <div
                  key={day}
                  className={`text-center font-bold py-2 text-sm ${
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {/* 月初の空白 */}
              {Array.from({ length: new Date(targetYear, targetMonth, 1).getDay() }, (_, i) => (
                <div key={`empty-${i}`} />
              ))}
              
              {/* 日付 */}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const request = myRequests[day];
                const othersCount = getOtherRequestsCount(day);
                const dayOfWeek = new Date(targetYear, targetMonth, day).getDay();
                const isHoliday = dayOfWeek === 0 || dayOfWeek === 6;
                
                return (
                  <div key={day} className="relative">
                    <button
                      onClick={() => {
                        if (!request) updateRequest(day, '休');
                        else if (request === '休') updateRequest(day, '有');
                        else updateRequest(day, null);
                      }}
                      className={`w-full aspect-square rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                        request === '休'
                          ? 'bg-gray-200 border-gray-400 shadow-inner'
                          : request === '有'
                          ? 'bg-emerald-200 border-emerald-400 shadow-inner'
                          : isHoliday
                          ? 'bg-red-50 border-red-100 hover:border-red-300'
                          : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow'
                      }`}
                    >
                      <span className={`text-sm md:text-base font-medium ${
                        dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-gray-700'
                      }`}>
                        {day}
                      </span>
                      {request && (
                        <span className={`text-xs font-bold ${
                          request === '休' ? 'text-gray-600' : 'text-emerald-700'
                        }`}>
                          {request === '休' ? '公休' : '有休'}
                        </span>
                      )}
                    </button>
                    
                    {othersCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold shadow">
                        {othersCount}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* フッター */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>入力内容は自動保存されます</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // 管理者画面
  // ============================================
  
  const monthKey = `${targetYear}-${targetMonth}`;
  const monthRequests = requests[monthKey] || {};
  const totalRequests = Object.values(monthRequests).reduce((sum, reqs) => sum + Object.keys(reqs).length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 mb-6 border border-white/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">看護師勤務表システム</h1>
              <p className="text-gray-500">管理者画面 - {targetYear}年{targetMonth + 1}月</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                  showSettings ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Settings size={18} />
                職員管理
              </button>
              <button
                onClick={() => setShowAccessCodes(true)}
                className="px-4 py-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Lock size={18} />
                コード発行
              </button>
              <button
                onClick={() => setShowRequestReview(true)}
                className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Eye size={18} />
                希望確認
              </button>
              <button
                onClick={() => setShowPrevMonthImport(true)}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-colors ${
                  previousMonthData ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Upload size={18} />
                前月読込{previousMonthData ? '✓' : ''}
              </button>
              <button
                onClick={() => setShowGenerateConfig(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl flex items-center gap-2 transition-colors"
              >
                <Settings size={18} />
                生成設定
              </button>
              <button
                onClick={generateSchedule}
                disabled={generating}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl flex items-center gap-2 shadow hover:shadow-lg transition-all disabled:opacity-50"
              >
                <RefreshCw size={18} className={generating ? 'animate-spin' : ''} />
                {generating ? '生成中...' : '自動生成'}
              </button>
              <button
                onClick={handleAdminLogout}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl flex items-center gap-2 transition-colors"
              >
                <LogOut size={18} />
                ログアウト
              </button>
            </div>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-3 rounded-xl">
                <Users className="text-indigo-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">登録職員</p>
                <p className="text-2xl font-bold text-indigo-600">{activeNurses.length}名</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 p-3 rounded-xl">
                <Calendar className="text-emerald-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">希望入力済</p>
                <p className="text-2xl font-bold text-emerald-600">{totalRequests}件</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-3 rounded-xl">
                <Moon className="text-purple-600" size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">対象月</p>
                <p className="text-2xl font-bold text-purple-600">{targetMonth + 1}月</p>
              </div>
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-5 border border-white/50">
            <div className="flex items-center gap-3">
              <div className={`${previousMonthData ? 'bg-orange-100' : 'bg-gray-100'} p-3 rounded-xl`}>
                <Upload className={previousMonthData ? 'text-orange-600' : 'text-gray-400'} size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-500">前月データ</p>
                <p className={`text-2xl font-bold ${previousMonthData ? 'text-orange-600' : 'text-gray-400'}`}>
                  {previousMonthData ? '読込済' : '未読込'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 前月制約表示（前月データがある場合） */}
        {previousMonthData && Object.keys(prevMonthConstraints).length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="text-orange-600" size={20} />
                <span className="font-medium text-orange-800">前月データに基づく当月初の制約が設定されています</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPrevMonthReview(true)}
                className="text-sm text-orange-600 hover:text-orange-800 underline"
              >
                詳細を確認
              </button>
            </div>
            <p className="text-sm text-orange-700 mt-2">
              {Object.keys(prevMonthConstraints).filter(id => Object.keys(prevMonthConstraints[id]).length > 0).length}名に
              当月1〜3日目の制約が適用されます（夜勤明け・休みなど）
            </p>
          </div>
        )}

        {/* 職員管理パネル */}
        {showSettings && (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 mb-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-gray-800">職員一覧（{activeNurses.length}名）</h2>
              <div className="flex gap-2">
                <label className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer flex items-center gap-2 transition-colors">
                  <Upload size={18} />
                  Excel読込
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => setShowAddNurse(true)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Plus size={18} />
                  追加
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeNurses.map(nurse => (
                <div
                  key={nurse.id}
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 p-3 rounded-xl transition-colors"
                >
                  {editingNurse === nurse.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={nurse.name}
                        className="flex-1 px-2 py-1 border rounded"
                        id={`edit-name-${nurse.id}`}
                      />
                      <select
                        defaultValue={nurse.position}
                        className="px-2 py-1 border rounded"
                        id={`edit-pos-${nurse.id}`}
                      >
                        {Object.keys(POSITIONS).map(pos => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const name = document.getElementById(`edit-name-${nurse.id}`).value;
                          const position = document.getElementById(`edit-pos-${nurse.id}`).value;
                          updateNurse(nurse.id, { name, position });
                          setEditingNurse(null);
                        }}
                        className="p-1 text-emerald-600 hover:text-emerald-800 cursor-pointer"
                      >
                        <Save size={18} className="pointer-events-none" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingNurse(null);
                        }}
                        className="p-1 text-gray-600 hover:text-gray-800 cursor-pointer"
                      >
                        <X size={18} className="pointer-events-none" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded-lg border ${POSITIONS[nurse.position]?.color}`}>
                          {nurse.position}
                        </span>
                        <span className="font-medium">{nurse.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingNurse(nurse.id);
                          }}
                          className="p-2 text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
                        >
                          <Edit2 size={16} className="pointer-events-none" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteConfirm(nurse);
                          }}
                          className="p-2 text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 size={16} className="pointer-events-none" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 勤務表表示エリア */}
        {schedule ? (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                {targetYear}年{targetMonth + 1}月 勤務表
              </h2>
              <button
                onClick={exportToExcel}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <Download size={18} />
                Excel出力
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 sticky left-0 bg-gray-100 z-10">氏名</th>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const dow = getDayOfWeek(targetYear, targetMonth, day);
                      const isHoliday = dow === '日' || dow === '土';
                      return (
                        <th
                          key={day}
                          className={`border p-1 min-w-[32px] ${isHoliday ? 'bg-red-50' : ''}`}
                        >
                          <div className={`text-xs ${dow === '日' ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>
                            {dow}
                          </div>
                          <div>{day}</div>
                        </th>
                      );
                    })}
                    {/* 個人別統計ヘッダー */}
                    <th className="border p-1 bg-purple-100 text-purple-800 text-xs">夜勤</th>
                    <th className="border p-1 bg-blue-100 text-blue-800 text-xs">日勤</th>
                    <th className="border p-1 bg-gray-200 text-gray-700 text-xs">休日</th>
                    <th className="border p-1 bg-amber-100 text-amber-800 text-xs">出勤</th>
                  </tr>
                </thead>
                <tbody>
                  {activeNurses.map(nurse => {
                    const shifts = schedule.data[nurse.id] || [];
                    // 個人別統計を計算
                    const stats = {
                      night: shifts.filter(s => s === '夜').length,
                      day: shifts.filter(s => s === '日' || s === '早' || s === '遅').length,
                      off: shifts.filter(s => s === '休' || s === '有' || s === '明').length,
                      work: shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length
                    };
                    
                    return (
                      <tr key={nurse.id} className="hover:bg-gray-50">
                        <td className="border p-2 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                          <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                            {nurse.position.charAt(0)}
                          </span>
                          {nurse.name}
                        </td>
                        {shifts.map((shift, i) => (
                          <td
                            key={i}
                            className={`border p-1 text-center ${SHIFT_TYPES[shift]?.color || ''}`}
                          >
                            {shift}
                          </td>
                        ))}
                        {/* 個人別統計 */}
                        <td className="border p-1 text-center bg-purple-50 font-bold text-purple-700">{stats.night}</td>
                        <td className="border p-1 text-center bg-blue-50 font-bold text-blue-700">{stats.day}</td>
                        <td className="border p-1 text-center bg-gray-100 font-bold text-gray-600">{stats.off}</td>
                        <td className="border p-1 text-center bg-amber-50 font-bold text-amber-700">{stats.work}</td>
                      </tr>
                    );
                  })}
                  
                  {/* 日別統計行 */}
                  <tr className="bg-purple-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-purple-50 z-10 text-purple-800">夜勤人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (schedule.data[nurse.id] || [])[i];
                        if (shift === '夜') count++;
                      });
                      return (
                        <td key={i} className={`border p-1 text-center text-purple-700 ${count < 2 ? 'bg-red-200 text-red-700' : count > 3 ? 'bg-yellow-200 text-yellow-700' : ''}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-pink-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-pink-50 z-10 text-pink-800">夜明人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (schedule.data[nurse.id] || [])[i];
                        if (shift === '明') count++;
                      });
                      return (
                        <td key={i} className="border p-1 text-center text-pink-700">
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-blue-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-blue-50 z-10 text-blue-800">日勤人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (schedule.data[nurse.id] || [])[i];
                        if (shift === '日' || shift === '早' || shift === '遅') count++;
                      });
                      const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                      const isWeekend = dow === '土' || dow === '日';
                      const day = i + 1;
                      // 年末年始判定
                      const isYearEnd = targetMonth === 11 && (day === 30 || day === 31);
                      const isNewYear = targetMonth === 0 && (day >= 1 && day <= 3);
                      const minRequired = isYearEnd ? generateConfig.yearEndDayStaff :
                                          isNewYear ? generateConfig.newYearDayStaff :
                                          isWeekend ? generateConfig.weekendDayStaff :
                                          generateConfig.weekdayDayStaff;
                      return (
                        <td key={i} className={`border p-1 text-center text-blue-700 ${count < minRequired ? 'bg-red-200 text-red-700' : ''}`}>
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <td className="border p-2 sticky left-0 bg-gray-100 z-10 text-gray-700">休日人数</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (schedule.data[nurse.id] || [])[i];
                        if (shift === '休' || shift === '有') count++;
                      });
                      return (
                        <td key={i} className="border p-1 text-center text-gray-600">
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                  <tr className="bg-amber-50 font-bold">
                    <td className="border p-2 sticky left-0 bg-amber-50 z-10 text-amber-800">出勤計</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      let count = 0;
                      activeNurses.forEach(nurse => {
                        const shift = (schedule.data[nurse.id] || [])[i];
                        if (shift && shift !== '休' && shift !== '有' && shift !== '明') count++;
                      });
                      return (
                        <td key={i} className="border p-1 text-center text-amber-700">
                          {count}
                        </td>
                      );
                    })}
                    <td colSpan={4} className="border p-1"></td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            {/* 統計サマリー */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">
                  {(() => {
                    let total = 0;
                    activeNurses.forEach(nurse => {
                      const shifts = schedule.data[nurse.id] || [];
                      total += shifts.filter(s => s === '夜').length;
                    });
                    return total;
                  })()}
                </div>
                <div className="text-sm text-purple-600">夜勤総数</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {(() => {
                    let total = 0;
                    activeNurses.forEach(nurse => {
                      const shifts = schedule.data[nurse.id] || [];
                      total += shifts.filter(s => s === '日' || s === '早' || s === '遅').length;
                    });
                    return total;
                  })()}
                </div>
                <div className="text-sm text-blue-600">日勤総数</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">
                  {(() => {
                    const nightCounts = activeNurses.map(nurse => {
                      const shifts = schedule.data[nurse.id] || [];
                      return shifts.filter(s => s === '夜').length;
                    });
                    return `${Math.min(...nightCounts)}〜${Math.max(...nightCounts)}`;
                  })()}
                </div>
                <div className="text-sm text-gray-600">夜勤回数(個人)</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">
                  {(() => {
                    const workCounts = activeNurses.map(nurse => {
                      const shifts = schedule.data[nurse.id] || [];
                      return shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                    });
                    return `${Math.min(...workCounts)}〜${Math.max(...workCounts)}`;
                  })()}
                </div>
                <div className="text-sm text-amber-600">出勤日数(個人)</div>
              </div>
            </div>
            
            {/* 週別夜勤統計 */}
            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
              <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                <Moon size={18} />
                週別夜勤人数
              </h4>
              <div className="flex flex-wrap gap-3">
                {(() => {
                  // 週ごとの実際の夜勤人数を計算
                  const weeks = [];
                  const firstDay = new Date(targetYear, targetMonth, 1);
                  const firstDayOfWeek = firstDay.getDay();
                  let currentDay = 1;
                  let weekIndex = 0;
                  
                  const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
                  if (daysUntilSunday > 0) {
                    weeks.push({ start: 1, end: daysUntilSunday, weekNum: 1 });
                    currentDay = daysUntilSunday + 1;
                    weekIndex = 1;
                  }
                  
                  while (currentDay <= daysInMonth) {
                    const endDay = Math.min(currentDay + 6, daysInMonth);
                    weeks.push({ start: currentDay, end: endDay, weekNum: weekIndex + 1 });
                    currentDay = endDay + 1;
                    weekIndex++;
                  }
                  
                  return weeks.map((w, i) => {
                    // 週内の各日の夜勤人数を計算
                    let totalNightShifts = 0;
                    let daysCovered = 0;
                    for (let d = w.start - 1; d < w.end; d++) {
                      activeNurses.forEach(nurse => {
                        const shift = (schedule.data[nurse.id] || [])[d];
                        if (shift === '夜') totalNightShifts++;
                      });
                      daysCovered++;
                    }
                    const avgNight = daysCovered > 0 ? (totalNightShifts / daysCovered).toFixed(1) : 0;
                    
                    return (
                      <div key={i} className="bg-white rounded-lg px-4 py-2 text-center min-w-[100px]">
                        <div className="text-xs text-gray-500">第{w.weekNum}週</div>
                        <div className="text-xs text-gray-400">{w.start}〜{w.end}日</div>
                        <div className="text-xl font-bold text-purple-700">{avgNight}</div>
                        <div className="text-xs text-purple-600">人/日</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
            
            {/* 個人別詳細統計 */}
            <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
              <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                <Users size={18} />
                個人別統計詳細
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">氏名</th>
                      <th className="border p-2 text-center bg-purple-50">夜勤</th>
                      <th className="border p-2 text-center bg-blue-50">日勤</th>
                      <th className="border p-2 text-center bg-sky-50">早出</th>
                      <th className="border p-2 text-center bg-indigo-50">遅出</th>
                      <th className="border p-2 text-center bg-pink-50">夜明</th>
                      <th className="border p-2 text-center bg-gray-200">公休</th>
                      <th className="border p-2 text-center bg-emerald-50">有休</th>
                      <th className="border p-2 text-center bg-amber-50">出勤計</th>
                      <th className="border p-2 text-center bg-orange-50">土日出勤</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map(nurse => {
                      const shifts = schedule.data[nurse.id] || [];
                      const stats = {
                        night: shifts.filter(s => s === '夜').length,
                        day: shifts.filter(s => s === '日').length,
                        early: shifts.filter(s => s === '早').length,
                        late: shifts.filter(s => s === '遅').length,
                        ake: shifts.filter(s => s === '明').length,
                        off: shifts.filter(s => s === '休').length,
                        paid: shifts.filter(s => s === '有').length,
                        work: shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length,
                        weekend: 0
                      };
                      
                      // 土日出勤をカウント
                      shifts.forEach((shift, i) => {
                        if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                          const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                          if (dow === '土' || dow === '日') {
                            stats.weekend++;
                          }
                        }
                      });
                      
                      return (
                        <tr key={nurse.id} className="hover:bg-gray-50">
                          <td className="border p-2 font-medium whitespace-nowrap">
                            <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                              {nurse.position.charAt(0)}
                            </span>
                            {nurse.name}
                          </td>
                          <td className="border p-2 text-center bg-purple-50 font-bold text-purple-700">{stats.night}</td>
                          <td className="border p-2 text-center bg-blue-50 font-bold text-blue-700">{stats.day}</td>
                          <td className="border p-2 text-center bg-sky-50 font-bold text-sky-700">{stats.early}</td>
                          <td className="border p-2 text-center bg-indigo-50 font-bold text-indigo-700">{stats.late}</td>
                          <td className="border p-2 text-center bg-pink-50 font-bold text-pink-700">{stats.ake}</td>
                          <td className="border p-2 text-center bg-gray-200 font-bold text-gray-700">{stats.off}</td>
                          <td className="border p-2 text-center bg-emerald-50 font-bold text-emerald-700">{stats.paid}</td>
                          <td className="border p-2 text-center bg-amber-50 font-bold text-amber-700">{stats.work}</td>
                          <td className="border p-2 text-center bg-orange-50 font-bold text-orange-700">{stats.weekend}</td>
                        </tr>
                      );
                    })}
                    {/* 合計行 */}
                    <tr className="bg-gray-100 font-bold">
                      <td className="border p-2">合計</td>
                      {(() => {
                        let totals = { night: 0, day: 0, early: 0, late: 0, ake: 0, off: 0, paid: 0, work: 0, weekend: 0 };
                        activeNurses.forEach(nurse => {
                          const shifts = schedule.data[nurse.id] || [];
                          totals.night += shifts.filter(s => s === '夜').length;
                          totals.day += shifts.filter(s => s === '日').length;
                          totals.early += shifts.filter(s => s === '早').length;
                          totals.late += shifts.filter(s => s === '遅').length;
                          totals.ake += shifts.filter(s => s === '明').length;
                          totals.off += shifts.filter(s => s === '休').length;
                          totals.paid += shifts.filter(s => s === '有').length;
                          totals.work += shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                          shifts.forEach((shift, i) => {
                            if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                              const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                              if (dow === '土' || dow === '日') totals.weekend++;
                            }
                          });
                        });
                        return (
                          <>
                            <td className="border p-2 text-center bg-purple-100">{totals.night}</td>
                            <td className="border p-2 text-center bg-blue-100">{totals.day}</td>
                            <td className="border p-2 text-center bg-sky-100">{totals.early}</td>
                            <td className="border p-2 text-center bg-indigo-100">{totals.late}</td>
                            <td className="border p-2 text-center bg-pink-100">{totals.ake}</td>
                            <td className="border p-2 text-center bg-gray-300">{totals.off}</td>
                            <td className="border p-2 text-center bg-emerald-100">{totals.paid}</td>
                            <td className="border p-2 text-center bg-amber-100">{totals.work}</td>
                            <td className="border p-2 text-center bg-orange-100">{totals.weekend}</td>
                          </>
                        );
                      })()}
                    </tr>
                    {/* 平均行 */}
                    <tr className="bg-gray-50">
                      <td className="border p-2 text-gray-600">平均</td>
                      {(() => {
                        const n = activeNurses.length;
                        let totals = { night: 0, day: 0, early: 0, late: 0, ake: 0, off: 0, paid: 0, work: 0, weekend: 0 };
                        activeNurses.forEach(nurse => {
                          const shifts = schedule.data[nurse.id] || [];
                          totals.night += shifts.filter(s => s === '夜').length;
                          totals.day += shifts.filter(s => s === '日').length;
                          totals.early += shifts.filter(s => s === '早').length;
                          totals.late += shifts.filter(s => s === '遅').length;
                          totals.ake += shifts.filter(s => s === '明').length;
                          totals.off += shifts.filter(s => s === '休').length;
                          totals.paid += shifts.filter(s => s === '有').length;
                          totals.work += shifts.filter(s => s && s !== '休' && s !== '有' && s !== '明').length;
                          shifts.forEach((shift, i) => {
                            if (shift && shift !== '休' && shift !== '有' && shift !== '明') {
                              const dow = getDayOfWeek(targetYear, targetMonth, i + 1);
                              if (dow === '土' || dow === '日') totals.weekend++;
                            }
                          });
                        });
                        return (
                          <>
                            <td className="border p-2 text-center text-purple-600">{(totals.night / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-blue-600">{(totals.day / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-sky-600">{(totals.early / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-indigo-600">{(totals.late / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-pink-600">{(totals.ake / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-gray-600">{(totals.off / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-emerald-600">{(totals.paid / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-amber-600">{(totals.work / n).toFixed(1)}</td>
                            <td className="border p-2 text-center text-orange-600">{(totals.weekend / n).toFixed(1)}</td>
                          </>
                        );
                      })()}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-16 text-center border border-white/50">
            <div className="bg-gray-100 p-6 rounded-full inline-block mb-4">
              <Calendar className="text-gray-400" size={48} />
            </div>
            <h3 className="text-xl font-semibold text-gray-600 mb-2">勤務表を生成してください</h3>
            <p className="text-gray-400">「自動生成」ボタンで勤務表を作成します</p>
          </div>
        )}

        {/* アクセスコード発行モーダル */}
        {showAccessCodes && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">アクセスコード一覧</h3>
                <button
                  onClick={() => setShowAccessCodes(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>使い方：</strong>各職員にコードを伝えてください。
                  職員はトップ画面から「職員用（休み希望入力）」を選び、コードを入力します。
                  <br />
                  <strong>※コードは職員名から自動生成されるため、常に同じコードが使用できます。</strong>
                </p>
              </div>
              
              <button
                onClick={copyAllCodes}
                className="mb-4 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg self-start transition-colors"
              >
                全員分をコピー
              </button>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {nursesWithCodes.map(nurse => (
                  <div
                    key={nurse.id}
                    className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-lg border ${POSITIONS[nurse.position]?.color}`}>
                        {nurse.position}
                      </span>
                      <span className="font-medium">{nurse.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-mono font-bold text-xl px-4 py-2 bg-white border-2 rounded-lg">
                        {nurse.accessCode}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(nurse.accessCode);
                          alert(`${nurse.name}さんのコードをコピーしました: ${nurse.accessCode}`);
                        }}
                        className="px-3 py-2 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg text-sm transition-colors"
                      >
                        コピー
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>
        )}

        {/* 希望確認モーダル（管理者編集可能） */}
        {showRequestReview && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">休み希望一覧（{targetYear}年{targetMonth + 1}月）</h3>
                <button
                  onClick={() => setShowRequestReview(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 編集方法：</strong>セルをクリックして「休」「有」を切り替え。もう一度クリックでクリア。
                </p>
              </div>
              
              <div className="overflow-auto max-h-[65vh]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 sticky left-0 bg-gray-100 z-10">氏名</th>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const dow = getDayOfWeek(targetYear, targetMonth, day);
                        return (
                          <th key={day} className="border p-1 min-w-[32px]">
                            <div className={`text-xs ${dow === '日' ? 'text-red-500' : dow === '土' ? 'text-blue-500' : ''}`}>
                              {dow}
                            </div>
                            <div>{day}</div>
                          </th>
                        );
                      })}
                      <th className="border p-2">合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeNurses.map(nurse => {
                      const nurseRequests = monthRequests[String(nurse.id)] || {};
                      const requestCount = Object.keys(nurseRequests).length;
                      return (
                        <tr key={nurse.id} className="hover:bg-gray-50">
                          <td className="border p-2 sticky left-0 bg-white z-10 font-medium whitespace-nowrap">
                            <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                              {nurse.position.charAt(0)}
                            </span>
                            {nurse.name}
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => {
                            const day = i + 1;
                            const req = nurseRequests[day];
                            return (
                              <td
                                key={day}
                                onClick={() => {
                                  // 管理者による編集: 休 → 有 → クリア → 休 のサイクル
                                  const monthKey = `${targetYear}-${targetMonth}`;
                                  const nurseIdKey = String(nurse.id);
                                  const currentVal = requests[monthKey]?.[nurseIdKey]?.[day];
                                  
                                  setRequests(prev => {
                                    const newRequests = { ...prev };
                                    if (!newRequests[monthKey]) newRequests[monthKey] = {};
                                    if (!newRequests[monthKey][nurseIdKey]) newRequests[monthKey][nurseIdKey] = {};
                                    
                                    if (!currentVal) {
                                      newRequests[monthKey][nurseIdKey][day] = '休';
                                    } else if (currentVal === '休') {
                                      newRequests[monthKey][nurseIdKey][day] = '有';
                                    } else {
                                      delete newRequests[monthKey][nurseIdKey][day];
                                      if (Object.keys(newRequests[monthKey][nurseIdKey]).length === 0) {
                                        delete newRequests[monthKey][nurseIdKey];
                                      }
                                    }
                                    return newRequests;
                                  });
                                }}
                                className={`border p-1 text-center cursor-pointer hover:bg-blue-100 transition-colors ${
                                  req === '休' ? 'bg-gray-200' :
                                  req === '有' ? 'bg-emerald-200' : ''
                                }`}
                              >
                                {req || ''}
                              </td>
                            );
                          })}
                          <td className="border p-2 text-center font-bold">
                            {requestCount}
                          </td>
                        </tr>
                      );
                    })}
                    {/* 日ごとの合計行 */}
                    <tr className="bg-amber-50 font-bold">
                      <td className="border p-2 sticky left-0 bg-amber-50 z-10">希望人数</td>
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        let count = 0;
                        Object.values(monthRequests).forEach(reqs => {
                          if (reqs[day]) count++;
                        });
                        return (
                          <td
                            key={day}
                            className={`border p-1 text-center ${count >= 3 ? 'text-red-600 bg-red-100' : ''}`}
                          >
                            {count || ''}
                          </td>
                        );
                      })}
                      <td className="border p-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowRequestReview(false)}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* 看護師追加モーダル */}
        {showAddNurse && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-md my-4">
              <h3 className="text-xl font-bold mb-4">職員を追加</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">氏名</label>
                  <input
                    type="text"
                    value={newNurseData.name}
                    onChange={(e) => setNewNurseData({ ...newNurseData, name: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                    placeholder="例：山田 花子"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職</label>
                  <select
                    value={newNurseData.position}
                    onChange={(e) => setNewNurseData({ ...newNurseData, position: e.target.value })}
                    className="w-full px-3 py-2 border-2 rounded-lg focus:border-indigo-500 focus:outline-none"
                  >
                    {Object.keys(POSITIONS).map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddNurse(false);
                    setNewNurseData({ name: '', position: '一般' });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={addNurse}
                  className="flex-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                >
                  追加
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Excel読み込みモーダル */}
        {showExcelImport && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Excelから職員情報を読み込み</h3>
                <button
                  onClick={() => {
                    setShowExcelImport(false);
                    setExcelData(null);
                    setExcelPreview([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-xl">
                <div>
                  <label className="block text-sm font-medium mb-1">開始行</label>
                  <input
                    type="number"
                    min="1"
                    value={importConfig.startRow}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, startRow: parseInt(e.target.value) || 1 };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">終了行</label>
                  <input
                    type="number"
                    min="1"
                    value={importConfig.endRow}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, endRow: parseInt(e.target.value) || 30 };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">氏名列</label>
                  <input
                    type="text"
                    value={importConfig.nameColumn}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, nameColumn: e.target.value.toUpperCase() };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="C"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">役職列</label>
                  <input
                    type="text"
                    value={importConfig.positionColumn}
                    onChange={(e) => {
                      const newConfig = { ...importConfig, positionColumn: e.target.value.toUpperCase() };
                      setImportConfig(newConfig);
                      updateExcelPreview(excelData, newConfig);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="D"
                  />
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-semibold mb-3">プレビュー（{excelPreview.length}名）</h4>
                <div className="border rounded-lg max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm">行</th>
                        <th className="px-4 py-2 text-left text-sm">氏名</th>
                        <th className="px-4 py-2 text-left text-sm">役職</th>
                      </tr>
                    </thead>
                    <tbody>
                      {excelPreview.length === 0 ? (
                        <tr>
                          <td colSpan="3" className="px-4 py-8 text-center text-gray-500">
                            データが見つかりません
                          </td>
                        </tr>
                      ) : (
                        excelPreview.map((item, index) => (
                          <tr key={index} className="border-t">
                            <td className="px-4 py-2 text-sm">{item.row}</td>
                            <td className="px-4 py-2 text-sm font-medium">{item.name}</td>
                            <td className="px-4 py-2 text-sm">{item.position}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-amber-800">
                  <strong>注意：</strong>「反映」をクリックすると、現在の職員リストが上書きされます。
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowExcelImport(false);
                    setExcelData(null);
                    setExcelPreview([]);
                  }}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={applyExcelImport}
                  disabled={excelPreview.length === 0}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 transition-colors"
                >
                  反映
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* 削除確認モーダル */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm my-4">
                <div className="text-center mb-6">
                  <div className="bg-red-100 p-4 rounded-full inline-block mb-4">
                    <Trash2 className="text-red-600 pointer-events-none" size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">削除の確認</h3>
                  <p className="text-gray-600">
                    <span className="font-semibold">{deleteConfirm.name}</span>さんを削除しますか？
                  </p>
                  <p className="text-sm text-red-500 mt-2">この操作は取り消せません</p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteNurse(deleteConfirm.id);
                      setDeleteConfirm(null);
                    }}
                    className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors cursor-pointer"
                  >
                    削除する
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 前月データ読み込みモーダル */}
        {showPrevMonthImport && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">前月勤務表の読み込み</h3>
                  <button
                    type="button"
                    onClick={() => setShowPrevMonthImport(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                  <p className="text-sm text-orange-800">
                    <strong>目的：</strong>前月末の勤務状況（夜勤・夜勤明けなど）を読み込み、
                    当月初の勤務を自動で調整します。
                  </p>
                  <ul className="text-sm text-orange-700 mt-2 space-y-1">
                    <li>• 前月末が夜勤 → 1日目は夜勤明け、2日目は休み</li>
                    <li>• 前月末が夜勤明け → 1日目は休み</li>
                    <li>• 連続勤務4日以上 → 1日目は休み</li>
                  </ul>
                </div>
                
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">前月の勤務表（Excel）を選択</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handlePrevMonthUpload}
                      className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200"
                    />
                  </label>
                  
                  {previousMonthData && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-sm text-green-800 font-medium">
                        ✅ 前月データ確定済み（{Object.keys(previousMonthData).filter(id => previousMonthData[id] && previousMonthData[id].length > 0).length}名分）
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPrevMonthImport(false);
                            setShowPrevMonthReview(true);
                          }}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
                        >
                          データを確認
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearPreviousMonthData();
                          }}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm transition-colors"
                        >
                          クリア
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end mt-6">
                  <button
                    type="button"
                    onClick={() => setShowPrevMonthImport(false)}
                    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 勤務表生成設定モーダル */}
        {showGenerateConfig && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-2xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">⚙️ 勤務表生成設定</h3>
                  <button
                    type="button"
                    onClick={() => setShowGenerateConfig(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* 週ごとの夜勤人数設定 */}
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <h4 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                      <Moon size={20} />
                      週ごとの夜勤人数（隔週交互）
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">奇数週（第1, 3, 5週）</label>
                        <select
                          value={generateConfig.nightShiftPattern[generateConfig.startWithThree ? 0 : 1]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGenerateConfig(prev => ({
                              ...prev,
                              nightShiftPattern: generateConfig.startWithThree ? [val, prev.nightShiftPattern[1]] : [prev.nightShiftPattern[0], val]
                            }));
                          }}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          <option value={2}>2人</option>
                          <option value={3}>3人</option>
                          <option value={4}>4人</option>
                          <option value={5}>5人</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">偶数週（第2, 4週）</label>
                        <select
                          value={generateConfig.nightShiftPattern[generateConfig.startWithThree ? 1 : 0]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setGenerateConfig(prev => ({
                              ...prev,
                              nightShiftPattern: generateConfig.startWithThree ? [prev.nightShiftPattern[0], val] : [val, prev.nightShiftPattern[1]]
                            }));
                          }}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          <option value={2}>2人</option>
                          <option value={3}>3人</option>
                          <option value={4}>4人</option>
                          <option value={5}>5人</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* 週のプレビュー */}
                    <div className="bg-white rounded-lg p-3 text-sm">
                      <p className="font-medium mb-2">{targetYear}年{targetMonth + 1}月のプレビュー:</p>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const weeks = [];
                          const firstDay = new Date(targetYear, targetMonth, 1);
                          const firstDayOfWeek = firstDay.getDay();
                          let currentDay = 1;
                          let weekIndex = 0;
                          
                          // 第1週（月初から最初の日曜日まで）
                          const daysUntilSunday = firstDayOfWeek === 0 ? 0 : (7 - firstDayOfWeek);
                          if (daysUntilSunday > 0) {
                            const count = generateConfig.startWithThree ? generateConfig.nightShiftPattern[0] : generateConfig.nightShiftPattern[1];
                            weeks.push({ start: 1, end: daysUntilSunday, count, weekNum: 1 });
                            currentDay = daysUntilSunday + 1;
                            weekIndex = 1;
                          }
                          
                          while (currentDay <= daysInMonth) {
                            const patternIndex = generateConfig.startWithThree ? (weekIndex % 2) : ((weekIndex + 1) % 2);
                            const count = generateConfig.nightShiftPattern[patternIndex];
                            const endDay = Math.min(currentDay + 6, daysInMonth);
                            weeks.push({ start: currentDay, end: endDay, count, weekNum: weekIndex + 1 });
                            currentDay = endDay + 1;
                            weekIndex++;
                          }
                          
                          return weeks.map((w, i) => (
                            <span key={i} className={`px-3 py-1 rounded-full text-xs font-medium ${
                              w.count === 3 ? 'bg-blue-100 text-blue-700' : 
                              w.count === 4 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {w.start}-{w.end}日: {w.count}人
                            </span>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* その他の設定 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <h4 className="font-bold text-gray-800 mb-3">その他の制約</h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大夜勤回数</label>
                        <select
                          value={generateConfig.maxNightShifts}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxNightShifts: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[4, 5, 6, 7, 8].map(n => (
                            <option key={n} value={n}>{n}回</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最小休日数</label>
                        <select
                          value={generateConfig.minDaysOff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, minDaysOff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n}日</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">最大連続勤務</label>
                        <select
                          value={generateConfig.maxConsecutiveDays}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, maxConsecutiveDays: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {[4, 5, 6, 7].map(n => (
                            <option key={n} value={n}>{n}日</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  {/* 日勤者数設定 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                      <Sun size={20} />
                      日勤者数の設定
                    </h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">平日</label>
                        <select
                          value={generateConfig.weekdayDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, weekdayDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 7).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">土日・祝日</label>
                        <select
                          value={generateConfig.weekendDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, weekendDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 9 }, (_, i) => i + 7).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">年末(12/30-31)</label>
                        <select
                          value={generateConfig.yearEndDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, yearEndDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 11 }, (_, i) => i + 5).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">年始(1/1-3)</label>
                        <select
                          value={generateConfig.newYearDayStaff}
                          onChange={(e) => setGenerateConfig(prev => ({ ...prev, newYearDayStaff: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 border-2 rounded-lg"
                        >
                          {Array.from({ length: 11 }, (_, i) => i + 5).map(n => (
                            <option key={n} value={n}>{n}人</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="mt-3 text-xs text-blue-600">
                      ※ 年末年始設定は12月・1月の勤務表生成時に適用されます
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center mt-6">
                  <button
                    type="button"
                    onClick={() => setShowGenerateConfig(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                  >
                    閉じる
                  </button>
                  <button
                    type="button"
                    onClick={generateSchedule}
                    disabled={generating}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={`inline mr-2 ${generating ? 'animate-spin' : ''}`} />
                    {generating ? '生成中...' : 'この設定で生成'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 前月データ確認モーダル（マッピング編集UI） */}
        {showPrevMonthReview && (prevMonthRawData.length > 0 || previousMonthData) && (
          <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            <div className="min-h-full flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold">
                    {prevMonthRawData.length > 0 ? '📋 前月データのマッピング設定' : '✅ 確定済み前月データ'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (prevMonthRawData.length > 0) {
                        cancelPreviousMonthPreview();
                      } else {
                        setShowPrevMonthReview(false);
                      }
                    }}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
                
                {prevMonthRawData.length > 0 ? (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-amber-800">
                        <strong>⚠️ 各職員に対応するExcelの行を選択してください。</strong>
                        <br />
                        システム登録の職員名とExcelの氏名が異なる場合は、ドロップダウンから正しい行を選択してください。
                      </p>
                    </div>
                    
                    <div className="overflow-auto max-h-[55vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="border p-2 text-left min-w-[120px]">システム職員</th>
                            <th className="border p-2 text-left min-w-[200px]">Excelデータ選択</th>
                            <th className="border p-2 text-center bg-gray-50" colSpan={7}>前月末（7日分）</th>
                            <th className="border p-2 text-center bg-orange-100" colSpan={3}>当月制約</th>
                          </tr>
                          <tr>
                            <th className="border p-2"></th>
                            <th className="border p-2"></th>
                            {[7, 6, 5, 4, 3, 2, 1].map(d => (
                              <th key={d} className="border p-1 text-center text-xs text-gray-500">{d}日前</th>
                            ))}
                            <th className="border p-1 text-center text-xs bg-orange-50">1日</th>
                            <th className="border p-1 text-center text-xs bg-orange-50">2日</th>
                            <th className="border p-1 text-center text-xs bg-orange-50">3日</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNurses.map(nurse => {
                            const mappedIndex = prevMonthMapping[nurse.id];
                            const mappedData = mappedIndex !== undefined ? prevMonthRawData[mappedIndex] : null;
                            const shifts = mappedData ? mappedData.shifts : [];
                            const paddedShifts = [...Array(7 - shifts.length).fill(''), ...shifts];
                            
                            // 制約をリアルタイム計算
                            const constraints = {};
                            if (shifts.length > 0) {
                              const lastShift = shifts[shifts.length - 1];
                              const secondLastShift = shifts.length > 1 ? shifts[shifts.length - 2] : '';
                              const thirdLastShift = shifts.length > 2 ? shifts[shifts.length - 3] : '';
                              
                              if (lastShift === '夜') {
                                constraints[0] = '明';
                                constraints[1] = '休';
                                if (thirdLastShift === '夜' && secondLastShift === '明') {
                                  constraints[2] = '休';
                                }
                              } else if (lastShift === '明') {
                                constraints[0] = '休';
                                if (secondLastShift === '夜' && shifts.length >= 4 && 
                                    shifts[shifts.length - 4] === '夜' && shifts[shifts.length - 3] === '明') {
                                  constraints[1] = '休';
                                }
                              }
                              
                              // 連続勤務チェック
                              let consecutiveWork = 0;
                              for (let i = shifts.length - 1; i >= 0; i--) {
                                const s = shifts[i];
                                if (s && s !== '休' && s !== '有' && s !== '明') {
                                  consecutiveWork++;
                                } else {
                                  break;
                                }
                              }
                              if (consecutiveWork >= 4 && !constraints[0]) {
                                constraints[0] = '休';
                              }
                            }
                            
                            return (
                              <tr key={nurse.id} className={`hover:bg-gray-50 ${!mappedData ? 'bg-yellow-50' : ''}`}>
                                <td className="border p-2 font-medium whitespace-nowrap">
                                  <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                    {nurse.position}
                                  </span>
                                  {nurse.name}
                                </td>
                                <td className="border p-2">
                                  <select
                                    value={mappedIndex !== undefined ? mappedIndex : ''}
                                    onChange={(e) => updateMapping(nurse.id, e.target.value)}
                                    className="w-full px-2 py-1 border rounded text-sm"
                                  >
                                    <option value="">-- 選択してください --</option>
                                    {prevMonthRawData.map((row, idx) => (
                                      <option key={idx} value={idx}>
                                        {idx + 1}. {row.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                {paddedShifts.map((shift, i) => (
                                  <td key={i} className={`border p-1 text-center ${
                                    shift === '夜' ? 'bg-purple-100 text-purple-800' :
                                    shift === '明' ? 'bg-pink-100 text-pink-800' :
                                    shift === '休' || shift === '有' ? 'bg-gray-300' :
                                    shift === '日' ? 'bg-blue-50 text-blue-800' : ''
                                  }`}>
                                    {shift || '-'}
                                  </td>
                                ))}
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[0] === '明' ? 'text-pink-600' :
                                  constraints[0] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[0] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[1] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[1] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[2] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[2] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* 統計情報 */}
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                      <div className="flex gap-6 flex-wrap">
                        <span>Excel読み込み件数: <strong>{prevMonthRawData.length}名</strong></span>
                        <span>マッピング済み: <strong className="text-green-600">
                          {Object.values(prevMonthMapping).filter(v => v !== undefined).length}名
                        </strong></span>
                        <span>未設定: <strong className="text-yellow-600">
                          {activeNurses.length - Object.values(prevMonthMapping).filter(v => v !== undefined).length}名
                        </strong></span>
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-6">
                      <button
                        type="button"
                        onClick={cancelPreviousMonthPreview}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={confirmPreviousMonthData}
                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-bold shadow-lg transition-all"
                      >
                        ✓ 確定する
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                      <p className="text-sm text-green-800">
                        <strong>✅ 確定済み</strong> - 「自動生成」ボタンを押すと、この制約が適用されます。
                      </p>
                    </div>
                    
                    <div className="overflow-auto max-h-[55vh]">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="border p-2 text-left">職員名</th>
                            <th className="border p-2 text-center bg-gray-50" colSpan={7}>前月末（7日分）</th>
                            <th className="border p-2 text-center bg-orange-100" colSpan={3}>当月制約</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeNurses.map(nurse => {
                            const shifts = previousMonthData[nurse.id] || [];
                            const paddedShifts = [...Array(7 - shifts.length).fill(''), ...shifts];
                            const constraints = prevMonthConstraints[nurse.id] || {};
                            
                            return (
                              <tr key={nurse.id} className={`hover:bg-gray-50 ${shifts.length === 0 ? 'bg-gray-100' : ''}`}>
                                <td className="border p-2 font-medium whitespace-nowrap">
                                  <span className={`text-xs px-1 py-0.5 rounded mr-1 ${POSITIONS[nurse.position]?.color}`}>
                                    {nurse.position}
                                  </span>
                                  {nurse.name}
                                </td>
                                {paddedShifts.map((shift, i) => (
                                  <td key={i} className={`border p-1 text-center ${
                                    shift === '夜' ? 'bg-purple-100 text-purple-800' :
                                    shift === '明' ? 'bg-pink-100 text-pink-800' :
                                    shift === '休' || shift === '有' ? 'bg-gray-300' :
                                    shift === '日' ? 'bg-blue-50 text-blue-800' : ''
                                  }`}>
                                    {shift || '-'}
                                  </td>
                                ))}
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[0] === '明' ? 'text-pink-600' :
                                  constraints[0] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[0] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[1] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[1] || '-'}
                                </td>
                                <td className={`border p-1 text-center font-bold bg-orange-50 ${
                                  constraints[2] === '休' ? 'text-gray-600' : ''
                                }`}>
                                  {constraints[2] || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    <div className="flex justify-between items-center mt-6">
                      <button
                        type="button"
                        onClick={() => {
                          clearPreviousMonthData();
                          setShowPrevMonthReview(false);
                        }}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                      >
                        データをクリア
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPrevMonthReview(false)}
                        className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors"
                      >
                        閉じる
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NurseScheduleSystem;
