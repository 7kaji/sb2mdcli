const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '-–disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
    headless: true,
    // slowMo: 50
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja' });
  await page.setViewport({ width: 1000, height: 1000 });

  const url = process.argv[2]; // $ node puppeteer.js <URL>
  await page.goto(url, {waitUntil: 'networkidle2'} );

  //////////////////////////////////////////////////////////
  // REF: https://github.com/daiiz/sb2md/blob/master/main.js
  await page.evaluate(() => {
     /** 対応記法
     * - ノーマルテキスト
     * - 多段箇条書き
     * - 見出し
     * - 画像
     * - リンク
     * - 単一行コード
     **/

    var writer = (title='Title', texts=[]) => {
      var res = `# ${title}\n`;
      for (var i = 0; i < texts.length; i++) {
          var text = texts[i];
          res += '\n' + text;
      }

      document.write(`<title>${title}</title>`);
      document.write('<pre id="root">');
      document.write(escapeHtml(res));
      document.write('</pre>');
    }

    var escapeHtml = (str) => {
      str = str.replace(/&/g, '&amp;');
      str = str.replace(/</g, '&lt;');
      str = str.replace(/>/g, '&gt;');
      str = str.replace(/"/g, '&quot;');
      str = str.replace(/'/g, '&#39;');
      return str;
    };

    var markdownIndent = (level=0) => {
      var indent = '';
      for (var u = 1; u < level; u++) {
        // 半角スペース4個ぶん
        indent += '    ';
      }
      return indent;
    };

    // level小: 文字小 (Scrapbox記法に準ずる)
    // 1 <= level <= MAX_LEVEL
    // (MAX_LEVEL + 1) - level: 「#」の数
    var headlineMark = (level=1) => {
      var MAX_LEVEL = 5;
      var numMarks = (MAX_LEVEL + 1) - level;
      var r = '';
      for (var i = 0; i < numMarks; i++) {
        r += '#';
      }
      return r;
    }

    var headline = (text='') => {
      var div = document.createElement("div");
      div.innerHTML = text;
      var strongTags = div.querySelectorAll('strong');
      for (var i = 0; i < strongTags.length; i++) {
        var strong = strongTags[i];
        var level = +(strong.className.split('level-')[1]);
        var title = strong.innerHTML;
        strong.innerHTML = `${headlineMark(level)} ${title}`;
      }
      return div.innerHTML;
    };

    var links = (text='') => {
      var div = document.createElement("div");
      div.innerHTML = text;

      var aTags = div.querySelectorAll('a');
      for (var i = 0; i < aTags.length; i++) {
        var a = aTags[i];
        var aHtml = a.innerText.trim();
        var aHref = a.href;
        var linkMarkdown = `[${aHtml}](${aHref})`;

        // 画像対応
        var img = a.querySelector('img');
        if (img !== null) {
          linkMarkdown = `[![Image](${img.src})](${aHref})`;
        }
        a.innerText = linkMarkdown;
      }
      return div.innerText;
    };


    var lines = document.querySelector('.lines');
    var pageTitle = lines.querySelector('.line-title .text').innerText;
    var indentUnitWidthEm = 1.5

    lines = lines.querySelectorAll('.line');
    pageTexts = [];
    for (var i = 1; i < lines.length; i++) {
      var line = lines[i].querySelector('.text').cloneNode(true);

      // 空白文字を持つ要素を除去
      var emptyChars = line.querySelectorAll('span.empty-char-index');
      for (var j = 0; j < emptyChars.length; j++) {
        var e = emptyChars[j];
        e.innerText = '';
      }

      // バッククオートを有効化
      var backQuos = line.querySelectorAll('span.backquote');
      for (var j = 0; j < backQuos.length; j++) {
        var e = backQuos[j];
        e.innerText = '`';
      }

      var html = line.innerHTML.replace(/<span>/g, '');
      html = html.replace(/<span.+?>/g, '').replace(/<\/span>/g, '');
      html = html.replace(/<br.+?>/g, '');
      var text = html.replace(/\n/gi, '').replace(/\t/gi, '').trim();

      text = headline(text);
      text = links(text);

      // 箇条書き対応
      var liDot = line.querySelector('.indent-mark');
      if (liDot !== null) {
        // 箇条書きの入れ子構造を取得
        var width = +((liDot.style.width).split('em')[0]);
        var indentLevel = width / indentUnitWidthEm;
        text = markdownIndent(indentLevel) + '- ' + text;
      }
      if (liDot === null && text.length > 0 && text[0] !== '#') {
        text += "\n"
      }

      pageTexts.push(text);
    }

    writer(pageTitle, pageTexts);
  });
  //////////////////////////////////////////////////////////

  const body = await page.evaluate(() => {
    return document.querySelector('#root').innerText;
  });
  const title = body.split(/\r\n|\r|\n/)[0].split("# ")[1];

  const outputDir = 'scrapbox_md';
  if (!fs.existsSync(`./${outputDir}`)) {
    fs.mkdir(`./${outputDir}`,  (err) => {});
    console.log('mkdir ./scrapbox_md');
  }
  fs.writeFile(`./${outputDir}/${title}.md`, body, (err) => {
    if (err) throw err;
    console.log(`generated ./${outputDir}/${title}.md`);
  });

  await browser.close();
})()
