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

function getMediaType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const audioExt = ['aac', 'mp3', 'wav', 'ogg', 'm4a', 'flac'];
  const videoExt = ['mp4', 'webm', 'mov', 'mkv'];
  if (audioExt.includes(extension)) return 'audio';
  if (videoExt.includes(extension)) return 'video';
  return 'file';
}

function createMediaCard(media) {
  const card = document.createElement('article');
  card.className = 'media-item';

  const header = document.createElement('div');
  header.className = 'media-header';
  header.innerHTML = `
    <div>
      <h2 class="media-title">${media.label}</h2>
      <p class="file-info"><strong>File:</strong> ${media.name}</p>
    </div>
    <span class="tag">${getMediaType(media.name)}</span>
  `;

  const mediaWrapper = document.createElement('div');
  const type = getMediaType(media.name);
  if (type === 'audio') {
    mediaWrapper.innerHTML = `<audio class="media-player" controls src="${media.src}"></audio>`;
  } else if (type === 'video') {
    mediaWrapper.innerHTML = `<video class="media-player" controls src="${media.src}"></video>`;
  } else {
    mediaWrapper.innerHTML = `<div class="notice">No inline preview available for this file type.</div>`;
  }

  const info = document.createElement('div');
  info.className = 'file-info';
  info.innerHTML = `
    <div><strong>Description:</strong> ${media.description}</div>
    <div><strong>Path:</strong> <code>${media.src}</code></div>
  `;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.className = 'button primary';
  downloadButton.textContent = 'Download file';
  downloadButton.addEventListener('click', () => {
    const anchor = document.createElement('a');
    anchor.href = media.src;
    anchor.download = media.name;
    anchor.click();
  });

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'button secondary';
  copyButton.textContent = 'Copy share link';
  copyButton.addEventListener('click', async () => {
    const url = new URL(media.src, document.baseURI).href;
    try {
      await navigator.clipboard.writeText(url);
      copyButton.textContent = 'Link copied!';
      setTimeout(() => {
        copyButton.textContent = 'Copy share link';
      }, 1600);
    } catch (error) {
      window.prompt('Copy this link manually:', url);
    }
  });

  actions.append(downloadButton, copyButton);
  card.append(header, mediaWrapper, info, actions);
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

