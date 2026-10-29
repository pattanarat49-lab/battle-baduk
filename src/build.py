import re
strip=lambda s: s.replace('if (typeof module !== "undefined") module.exports = GoEngine;\n','').replace('if (typeof module !== "undefined") module.exports = GoFeatures;\n','').replace('if (typeof module !== "undefined") module.exports = GoTFNet;\n','').replace('if (typeof module !== "undefined") module.exports = GoNNAI;\n','')
head=open('nn_head.html').read()
js="\n".join(strip(open(f).read()) for f in ['engine.js','features.js','tfnet.js','nnai.js'])
page=head+'''<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"></script>
<script>if (!window.tf) document.write('<script src="tf.min.js"><\\/script>');</script>
<script src="tf-backend-wasm.min.js"></script>
<script>
'''+js+'''
</script>
<script>
'''+open('tutorial.js').read()+'''
</script>
<script>
'''+open('nn_main.js').read()+'''
</script>
'''
open('site/index.html','w').write(page)
