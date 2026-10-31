async function loadMedia() {
  try {
    const response = await fetch('/media-list');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return data.media; // the array of resources
  } catch (err) {
    console.error('Failed to load media list:', err);
    return [];
  }
}

const mediaList = document.getElementById('mediaList');
const TYPE_EXTENSIONS = {
  audio: ['aac', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'],
  video: ['mp4', 'webm', 'mov', 'mkv'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'],
  pdf:   ['pdf'],
  text:  ['txt', 'md', 'json', 'csv', 'log', 'srt', 'vtt', 'ass', 'sub', 'xml', 'yml', 'yaml', 'ini'],
};

function getMediaType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  for (const [type, exts] of Object.entries(TYPE_EXTENSIONS)) {
    if (exts.includes(ext)) return type;
  }
  return 'file';
}

const TEXT_PREVIEW_BYTES = 20 * 1024; // only fetch the first 20 KB

// Small helper: a button that builds the preview only when clicked
function lazyPreview(wrapper, label, build) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'button secondary';
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Loading...';
    try {
      wrapper.replaceChildren(await build());
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Failed to load, try again';
    }
  });
  wrapper.append(btn);
}

function createPreview(media, type) {
  const url = '/' + media.src;
  const wrapper = document.createElement('div');
  wrapper.className = 'media-preview';

  switch (type) {
    case 'audio':
    case 'video': {
      const el = document.createElement(type);
      el.className = 'media-player';
      el.controls = true;
      el.preload = 'metadata';
      el.src = url;
      wrapper.append(el);
      break;
    }
    case 'image': {
      const img = document.createElement('img');
      img.className = 'media-image';
      img.loading = 'lazy';
      img.alt = media.name;
      img.src = url;
      img.addEventListener('error', () => {
        wrapper.replaceChildren(Object.assign(document.createElement('div'), {
          className: 'notice',
          textContent: 'Could not load this image.',
        }));
      });
      wrapper.append(img);
      break;
    }
    case 'pdf':
      lazyPreview(wrapper, 'Show PDF preview', () => {
        const frame = document.createElement('iframe');
        frame.className = 'media-frame';
        frame.title = media.name;
        frame.src = url;
        return frame;
      });
      break;
    case 'text':
      lazyPreview(wrapper, 'Show text preview', async () => {
        const res = await fetch(url, { headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let text = await res.text();
        const truncated = text.length > TEXT_PREVIEW_BYTES || res.status === 206;
        text = text.slice(0, TEXT_PREVIEW_BYTES);

        const pre = document.createElement('pre');
        pre.className = 'media-text';
        pre.textContent = truncated ? text + '\n\n... (preview truncated)' : text;
        return pre;
      });
      break;
    default: {
      const notice = document.createElement('div');
      notice.className = 'notice';
      notice.textContent = 'No inline preview available for this file type.';
      wrapper.append(notice);
    }
  }
  return wrapper;
}

function createMediaCard(media) {
  const type = getMediaType(media.name);
  const url = '/' + media.src;

  const card = document.createElement('article');
  card.className = 'media-item';

  // Header (textContent, so odd file names can't inject HTML)
  const header = document.createElement('div');
  header.className = 'media-header';

  const titleBox = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'media-title';
  title.textContent = media.label;
  const fileInfo = document.createElement('p');
  fileInfo.className = 'file-info';
  const strong = document.createElement('strong');
  strong.textContent = 'File: ';
  fileInfo.append(strong, media.name);
  titleBox.append(title, fileInfo);

  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = type;
  header.append(titleBox, tag);

  // Info
  const info = document.createElement('div');
  info.className = 'file-info';
  const desc = document.createElement('div');
  const descLabel = document.createElement('strong');
  descLabel.textContent = 'Description: ';
  desc.append(descLabel, media.description);
  const path = document.createElement('div');
  const pathLabel = document.createElement('strong');
  pathLabel.textContent = 'Path: ';
  const code = document.createElement('code');
  code.textContent = media.src;
  path.append(pathLabel, code);
  info.append(desc, path);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'actions';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'button primary';
  downloadButton.textContent = 'Download file';
  downloadButton.addEventListener('click', () => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = media.name;
    anchor.click();
  });

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'button secondary';
  copyButton.textContent = 'Copy share link';
  copyButton.addEventListener('click', async () => {
    const full = new URL(url, document.baseURI).href;
    try {
      await navigator.clipboard.writeText(full);
      copyButton.textContent = 'Link copied!';
      setTimeout(() => (copyButton.textContent = 'Copy share link'), 1600);
    } catch {
      window.prompt('Copy this link manually:', full);
    }
  });

  actions.append(downloadButton, copyButton);
  card.append(header, createPreview(media, type), info, actions);
  return card;
}

(async () => {
  const media = await loadMedia();
  console.log(media);
  if (media.length === 0) {
    mediaList.innerHTML = '<div class="notice">No media files found in the res folder. Add one and update the page script to display it.</div>';
  } else {
    media.forEach((media) => mediaList.append(createMediaCard(media)));
  }
})();

