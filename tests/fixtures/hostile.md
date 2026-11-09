# Hostile document

<script>window.pwned = 1</script>

<style>body { display: none }</style>

<p style="color:red" onclick="alert(1)">styled paragraph</p>

<img src="img/x.png" onerror="alert(1)" alt="relative image">

<a href="javascript:alert(1)">js link</a>

<a href="JaVaScRiPt:alert(2)">mixed-case js link</a>

<a href="javascript&colon;alert(3)">entity colon js link</a>

<a href="jav&#x61;script:alert(4)">entity letter js link</a>

<a href="vbscript:msgbox(1)">vbs link</a>

<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">data link</a>

<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="data image">

[markdown js link](javascript:alert(5))

[markdown entity js link](javascript&colon;alert(6))

![markdown js image](javascript:alert(7))

<iframe src="https://evil.example/"></iframe>

<object data="https://evil.example/x.swf"></object>

<embed src="https://evil.example/x.swf">

<form action="https://evil.example/" method="post"><input name="q"><button>go</button></form>

<base href="https://evil.example/">

<meta http-equiv="refresh" content="0;url=https://evil.example/">

<svg onload="alert(8)"><circle r="5"></circle><script>alert(9)</script></svg>

<math><mi xlink:href="javascript:alert(10)">x</mi></math>

<details><summary>Kept</summary>

Inside <b>bold</b> and x<sup>2</sup>.

</details>

[top](#top)

[doc](docs/a.md)

![image](img/x.png)

[mail](mailto:a@b)

[site](https://example.com/p?q=1)
