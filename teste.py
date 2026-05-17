= Python.Execute(
"
import pandas as pd
from itertools import combinations
from collections import Counter

# Carregar os dados da tabela do Power BI
df = dataset  # Substitua 'dataset' pelo nome correto da tabela no Power BI

# Agrupar itens vendidos para cada conta em uma lista
# usando a coluna 'Conta' e 'Nome do Item'
contas_itens = (
    df.groupby('Conta')['Nome do Item']
      .apply(list)
      .reset_index()
)

# Gerar todas as combinações únicas de itens vendidos juntos
# dentro de cada conta, excluindo pares do mesmo item
todas_combinacoes = []

for itens in contas_itens['Nome do Item']:

    # Usar 'set' para evitar contar combinações repetidas
    # na mesma conta
    combinacoes_unicas = set(combinations(itens, 2))

    todas_combinacoes.extend(combinacoes_unicas)

# Contar a frequência de cada combinação em todas as contas
contagem_combinacoes = Counter(todas_combinacoes)

# Transformar os dados em DataFrame
# para facilitar a visualização no Power BI
combinacoes_df = pd.DataFrame(
    contagem_combinacoes.items(),
    columns=['Combinacao', 'Frequencia']
)

combinacoes_df[['Item1', 'Item2']] = pd.DataFrame(
    combinacoes_df['Combinacao'].tolist(),
    index=combinacoes_df.index
)

combinacoes_df = combinacoes_df.drop(columns=['Combinacao'])

# Exibir o resultado no Power BI
combinacoes_df
",
[dataset = #"Filtered Rows"]
)