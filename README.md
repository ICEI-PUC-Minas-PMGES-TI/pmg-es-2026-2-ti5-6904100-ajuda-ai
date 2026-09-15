# Ajuda-aí

O objetivo do **Ajuda aí** é facilitar a integração e adaptação dos alunos ingressantes ao curso, conectando-os a alunos veteranos por meio de um programa de apadrinhamento e oferecendo ferramentas de comunicação, orientação acadêmica e gamificação para incentivar a participação e a colaboração entre os estudantes.


## Integrantes

* Arthur Gonçalves Vieira 
* Arthur Henrique de Lima Santos
* Fernanda Soares Oliveira Cunha
* Gabriel Lacerda Lemos
* Luiz Arthur Costa e Costa
* Matheus Guilherme Viana Pereira

## Orientadores

* Leonardo Vilela Cardoso
* João Paulo Carneiro Aramuni
* Artur Martins Mol

## Instruções de utilização

### Aplicativo mobile

O aplicativo fica em `code/mobile/` e é desenvolvido em Flutter.

**Pré-requisitos**

* [Flutter](https://docs.flutter.dev/get-started/install) 3.47 ou superior (inclui o Dart SDK 3.13 ou superior)
* Um destes destinos de execução: navegador Chrome, emulador Android, simulador iOS ou desktop

Verifique o ambiente com `flutter doctor` antes de continuar.

**Instalação das dependências**

```bash
cd code/mobile
flutter pub get
```

**Execução**

```bash
flutter devices          # lista os destinos disponíveis
flutter run -d chrome    # executa no navegador
```

Para rodar em um emulador ou aparelho físico, substitua `chrome` pelo identificador
exibido por `flutter devices`. Durante a execução, `r` aplica hot reload e `R` reinicia
a aplicação.

**Testes e análise estática**

```bash
flutter test
flutter analyze
```

**O que já é possível navegar**

* **Tela de login** — apresentação do produto e acesso pelo botão *Entrar com a Microsoft*.
* **Tela inicial** — pontuação e nível do aluno, missão do dia, padrinho vinculado e
  lugares do campus para explorar.


