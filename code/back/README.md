# Código backend

O back-end da aplicação fica em [`api/`](api), desenvolvido em NestJS com TypeScript.
Consulte o [README da API](api/README.md) para pré-requisitos, instalação, execução e
a lista de endpoints disponíveis.

O login usa Microsoft Entra ID e JWT. O feed persiste publicações, curtidas e
comentários em PostgreSQL com TypeORM; os demais módulos ainda estão em evolução.
