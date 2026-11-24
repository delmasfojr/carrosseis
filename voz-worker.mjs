/* faz a limpeza da voz fora da tela principal, para o app não travar */
import {limpar} from './voz-nucleo.mjs';
import {Rnnoise} from './vendor/rnnoise/rnnoise.mjs';
let rn;
onmessage = async e => {
  const {id, som, modo} = e.data;
  try {
    rn = rn || await Rnnoise.load();
    const y = limpar(som, rn, modo);
    postMessage({id, som: y}, [y.buffer]);
  } catch (erro) { postMessage({id, erro: String(erro && erro.message || erro)}); }
};
