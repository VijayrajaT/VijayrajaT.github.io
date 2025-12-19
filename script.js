(function () {
  const STORAGE_KEY = 'todoItems';
  const DATE_KEY = 'todoDate';

  // Get today's date as YYYY-MM-DD
  function getTodayDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Load items from localStorage
  function loadItems() {
    const today = getTodayDate();
    const storedDate = localStorage.getItem(DATE_KEY);

    // If date has changed, clear the old list
    if (storedDate && storedDate !== today) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(DATE_KEY, today);
      return [];
    }

    // First time this day, set the date
    if (!storedDate) {
      localStorage.setItem(DATE_KEY, today);
    }

    try {
      const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      return items;
    } catch (e) {
      return [];
    }
  }

  // Save items to localStorage
  function saveItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  // Render all items from the array
  function renderItems(items, listEl) {
    listEl.innerHTML = '';
    items.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'event-item';
      li.dataset.index = idx;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'event-checkbox';
      checkbox.id = 'chk-' + idx;
      checkbox.checked = item.completed || false;

      checkbox.addEventListener('change', (e) => {
        items[idx].completed = e.target.checked;
        saveItems(items);
      });

      const label = document.createElement('label');
      label.htmlFor = checkbox.id;

      if (item.time) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'event-time';
        timeSpan.textContent = item.time + ' — ';
        label.appendChild(timeSpan);
      }

      label.appendChild(document.createTextNode(item.text));

      li.appendChild(checkbox);
      li.appendChild(label);
      listEl.appendChild(li);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Debug: log all buttons on the page
    const allButtons = document.querySelectorAll('button');
    console.log('Total buttons on page:', allButtons.length);
    allButtons.forEach((btn, i) => {
      console.log(`Button ${i}: id="${btn.id}", class="${btn.className}", text="${btn.textContent}"`);
    });

    // Try to find common IDs/inputs used in different HTML variants.
    const timeInput = document.getElementById('eventTime') || document.querySelector('input[type="time"]');
    let textInput = document.getElementById('eventInput') || document.querySelector('input[type="text"]');
    
    // Find the Add button - prefer explicit IDs first
    const addBtn = document.getElementById('addBtn') || document.getElementById('button1');
    
    // Find the Clear button - prefer explicit ID
    const clearBtn = document.getElementById('clear-button') || document.getElementById('clearBtn');
    
    console.log('addBtn found:', !!addBtn);
    console.log('clearBtn found:', !!clearBtn);
    console.log('clearBtn element:', clearBtn);
    // Track break timers so Clear All can cancel them
    let breakTimeoutId = null;
    let reminderTimeouts = [];
    let breakStatus = document.getElementById('break-status');
    let clearBreakTimers = null;
    let audioContext = null; // Shared for music and beeps

    // Wire up existing "Break" button if present (looks for button text or id containing 'break')
    const breakBtn = Array.from(document.querySelectorAll('button')).find(b => {
      return /break/i.test(b.textContent) || (b.id && b.id.toLowerCase().includes('break'));
    });

    if (breakBtn) {
      // try to find a nearby time input for this break button
      let breakTimeInput = breakBtn.parentElement && breakBtn.parentElement.querySelector('input[type="time"]');
      if (!breakTimeInput) {
        const container = breakBtn.closest('div');
        if (container) breakTimeInput = container.querySelector('input[type="time"]');
      }
      if (!breakTimeInput) {
        const timeInputs = document.querySelectorAll('input[type="time"]');
        if (timeInputs.length > 1) breakTimeInput = timeInputs[1];
        else if (timeInputs.length === 1) breakTimeInput = timeInputs[0];
      }

      // add small status element next to the button
      if (!breakStatus) {
        breakStatus = document.createElement('span');
        breakStatus.id = 'break-status';
        breakStatus.style.marginLeft = '8px';
        breakStatus.style.fontSize = '0.95em';
        breakStatus.textContent = '';
        breakBtn.parentNode.insertBefore(breakStatus, breakBtn.nextSibling);
      }

      clearBreakTimers = function() {
        if (breakTimeoutId) {
          clearTimeout(breakTimeoutId);
          breakTimeoutId = null;
        }
        if (reminderTimeouts && reminderTimeouts.length) {
          reminderTimeouts.forEach(id => clearTimeout(id));
          reminderTimeouts = [];
        }
        if (breakStatus) breakStatus.textContent = 'No break scheduled';
      }

      function scheduleBreak(timeStr) {
        console.log('Scheduling break for timeStr:', timeStr);
        if (!timeStr) { alert('Please select a break end time.'); return; }
        // clear any existing scheduled break
        clearBreakTimers();
        const now = new Date();
        const [hh, mm] = timeStr.split(':').map(Number);
        if (Number.isNaN(hh) || Number.isNaN(mm)) { alert('Invalid time'); return; }
        const target = new Date(now);
        target.setHours(hh, mm, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const delay = target.getTime() - now.getTime();
        console.log('Break scheduled, target:', target.toLocaleString(), 'delay ms:', delay);

        // request permission
        if ('Notification' in window && Notification.permission !== 'granted') {
          Notification.requestPermission().then(p => console.log('Notification permission:', p));
        }

        breakStatus.textContent = `Break set for ${timeStr}`;

        breakTimeoutId = setTimeout(() => {
          console.log('Break timeout triggered, sending notifications');
          // send 5 notifications 1s apart
          for (let i = 0; i < 5; i++) {
            const id = setTimeout(() => {
              console.log('Sending notification', i+1, 'permission:', Notification.permission);
              const body = i === 0 ? 'Your break time is over.' : `Reminder ${i}: break is over`;
              if ('Notification' in window && Notification.permission === 'granted') {
                try { new Notification('Break over', { body }); } catch (e) { console.warn(e); }
              } else {
                if (i === 0) alert('Break is over');
                else console.log(body);
              }
              // Play a beep sound
              if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
              }
              const beepOsc = audioContext.createOscillator();
              beepOsc.frequency.setValueAtTime(800, audioContext.currentTime);
              beepOsc.connect(audioContext.destination);
              beepOsc.start(audioContext.currentTime);
              beepOsc.stop(audioContext.currentTime + 0.2);
              if (i === 4) {
                if (breakStatus) breakStatus.textContent = 'No break scheduled';
                breakTimeoutId = null;
                reminderTimeouts = [];
              }
            }, i * 1000);
            reminderTimeouts.push(id);
          }
        }, delay);
      }

      breakBtn.addEventListener('click', () => {
        const timeStr = breakTimeInput && breakTimeInput.value ? breakTimeInput.value : '';
        scheduleBreak(timeStr);
      });
    }
    
    // Prefer an existing <ul> or <ol>. If not present, try to find element with id that looks like a list.
    const list = document.getElementById('eventsList') || document.getElementById('display-list') || document.getElementById('display list') || document.querySelector('ul') || document.querySelector('ol');

    if (!textInput || !addBtn || !list) {
      // If required elements are missing, log a helpful message but don't throw.
      console.warn('script.js: missing required elements. Expected a text input, an Add button, and a list container.');
      return;
    }

    // If the text input is a single-line <input type="text">, replace it with a <textarea>
    // so the user can paste or type multiple lines. We keep id, placeholder, classes, and aria attributes.
    if (textInput.tagName && textInput.tagName.toLowerCase() === 'input') {
      const typeAttr = (textInput.getAttribute('type') || '').toLowerCase();
      if (typeAttr === 'text') {
        const ta = document.createElement('textarea');
        // copy useful attributes
        if (textInput.id) ta.id = textInput.id;
        if (textInput.name) ta.name = textInput.name;
        ta.placeholder = textInput.placeholder || '';
        ta.className = textInput.className || '';
        if (textInput.getAttribute('aria-label')) ta.setAttribute('aria-label', textInput.getAttribute('aria-label'));
        ta.rows = 3;
        textInput.parentNode.replaceChild(ta, textInput);
        textInput = ta;
      }
    }



    // Load persisted items from localStorage
    let items = loadItems();

    // Ensure we're working with a real <ul> or <ol>. If the found list is not one, create a <ul> and replace it.
    let listEl = list;
    const tag = listEl.tagName ? listEl.tagName.toLowerCase() : '';
    if (tag !== 'ul' && tag !== 'ol') {
      const newUl = document.createElement('ul');
      newUl.id = listEl.id || 'eventsList';
      listEl.parentNode.replaceChild(newUl, listEl);
      listEl = newUl;
    }

    // Initial render
    renderItems(items, listEl);

    function addEvent() {
      const raw = textInput.value ? textInput.value.trim() : '';
      const time = timeInput && timeInput.value ? timeInput.value : '';
      if (!raw) return;

      // Parse multiple items: split on newlines, commas or semicolons
      const parts = raw.split(/(?:\r?\n|,|;)+/).map(s => s.trim()).filter(Boolean);

      parts.forEach(itemText => {
        items.push({
          text: itemText,
          time: time,
          completed: false
        });
      });

      saveItems(items);
      renderItems(items, listEl);

      // reset inputs and focus for convenience
      if (textInput.tagName.toLowerCase() === 'input' || textInput.tagName.toLowerCase() === 'textarea') textInput.value = '';
      if (timeInput && (timeInput.tagName.toLowerCase() === 'input')) timeInput.value = '';
      textInput.focus();
    }

    function clearAll() {
      if (confirm('Clear all items? This cannot be undone.')) {
        // also clear any scheduled break timers
        if (typeof clearBreakTimers === 'function') clearBreakTimers();

        items = [];
        saveItems(items);
        renderItems(items, listEl);
      }
    }

    addBtn.addEventListener('click', addEvent);

    // Also allow Enter to add when focused on the text input
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addEvent();
        e.preventDefault();
      }
    });

    // Clear All button
    if (clearBtn) {
      clearBtn.addEventListener('click', clearAll);
      console.log('Clear button found and handler attached');
    } else {
      console.warn('Clear button not found. Searched for #clear-button or #clearBtn');
    }

    // Play Music button
    const playMusicBtn = document.getElementById('play-music-button');
    if (playMusicBtn) {
      let audioContext = null;
      let oscillator = null;
      let isPlaying = false;
      console.log('Play Music button found');
      playMusicBtn.addEventListener('click', () => {
        console.log('Play Music button clicked, isPlaying:', isPlaying);
        if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (isPlaying) {
          if (oscillator) {
            oscillator.stop();
            oscillator = null;
          }
          playMusicBtn.textContent = 'Play Music';
          isPlaying = false;
          console.log('Music stopped');
        } else {
          oscillator = audioContext.createOscillator();
          oscillator.type = 'sine';
          oscillator.connect(audioContext.destination);
          let time = audioContext.currentTime;
          // Ode to Joy notes (Beethoven)
          let notes = [
            329.63, 329.63, 349.23, 392, 392, 349.23, 329.63, 293.66,
            261.63, 261.63, 293.66, 329.63, 329.63, 293.66, 293.66
          ];
          let duration = 0.4; // seconds per note
          let loopDuration = notes.length * duration; // 6 seconds
          let totalDuration = 3600; // 1 hour in seconds
          let repeats = Math.ceil(totalDuration / loopDuration);
          for (let i = 0; i < repeats; i++) {
            notes.forEach((freq, index) => {
              oscillator.frequency.setValueAtTime(freq, time + (i * notes.length + index) * duration);
            });
          }
          oscillator.start(time);
          oscillator.stop(time + totalDuration);
          oscillator.onended = () => {
            console.log('Music ended');
            playMusicBtn.textContent = 'Play Music';
            isPlaying = false;
            oscillator = null;
          };
          playMusicBtn.textContent = 'Pause Music';
          isPlaying = true;
          console.log('Music playing for 1 hour');
        }
      });
    } else {
      console.warn('Play Music button not found');
    }
  });
})();
