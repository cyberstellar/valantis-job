import React, {useEffect, useRef, useState} from 'react'
import md5 from 'crypto-js/md5'
import './App.scss'

type Product = {
  id: string,
  brand: string,
  price: number,
  product: string
}

type RequestBody = {
  [keys: string]: string | object
}

const MAX_ITEMS_PER_PAGE = 50
const MAX_CONNECTIONS_RETRY = 3

function formatDate(date = new Date()) {
  const utcYear = date.getUTCFullYear()
  const utcMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const utcDay = String(date.getUTCDate()).padStart(2, '0')
  return `${utcYear}${utcMonth}${utcDay}`
}

const apiKey = md5(`Valantis_${formatDate()}`).toString()
const rubFormatter = new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', minimumFractionDigits: 0})

async function fetchData(body: RequestBody, retryCount = 0): Promise<any> {
  try {
    const response = await fetch('https://api.valantis.store:41000/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth': apiKey
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorMessage = await response.text()
      throw new Error(errorMessage || 'An error occurred')
    }

    return await response.json()
  } catch (error) {
    if (retryCount < MAX_CONNECTIONS_RETRY) {
      console.error('An error occurred while executing the request', error)
      return await fetchData(body, retryCount + 1)
    } else {
      console.error('Max retries exceeded', error)
      return new Promise(resolve => resolve({result: []}))
    }
  }
}

function splitArray(arr: string[], chunkSize = MAX_ITEMS_PER_PAGE) {
  const chunks = []
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize))
  }
  return chunks
}

function App() {
  const [currentPage, setCurrentPage] = useState(0)
  const [isLastPage, setIsLastPage] = useState(true)
  const [isLoading, setIsLoading] = useState(false)

  const [productIds, setProductIds] = useState<string[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [arrayOfChunks, setArrayOfChunks] = useState<string[][]>([])
  const [isSearch, setIsSearch] = useState(false)
  const [filters, setFilters] = useState([])

  const searchRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    fetchData({
      "action": "get_fields",
    }).then(({result}) => setFilters(result))
  }, [])

  useEffect(() => {
    if (!productIds?.length) {
      setIsLoading(false)
      setIsLastPage(true)
      setProducts([])
      return
    }

    fetchData({
      'action': 'get_items',
      'params': {'ids': Array.from(new Set(productIds))}
    })
      .then(({result} = {result: []}) => {
        const uniqueIds = new Set<string>()
        const filteredResult = result.filter((product: Product) => {
          if (uniqueIds.has(product.id))
            return false
          uniqueIds.add(product.id)
          return true
        })
        setProducts(filteredResult)
        setIsLastPage(result.length < MAX_ITEMS_PER_PAGE)
      })
      .finally(() => setIsLoading(false))
  }, [productIds])

  useEffect(() => {
    getProductIds()
  }, [currentPage])

  useEffect(() => {
    if (!isSearch) return

    currentPage === 0
      ? getProductIds()
      : setCurrentPage(0)
  }, [isSearch])

  function getProductIds() {
    setIsLoading(true)
    const searchValue = searchRef.current?.value
    if (searchValue) {
      if (isSearch) {
        const filter = filterRef.current?.value
        if (!filter) return

        fetchData({
          "action": "filter",
          "params": {[filter]: filter === 'price' ? Number.parseInt(searchValue) : searchValue}
        }).then(({result} = {result: []}) => {
          const chunks = splitArray(result)
          setArrayOfChunks(chunks)
          setProductIds(chunks[0] ?? [])
        })
      } else {
        setProductIds(arrayOfChunks[currentPage] ?? [])
      }
    } else {
      fetchData({
        'action': 'get_ids',
        'params': {'offset': currentPage * MAX_ITEMS_PER_PAGE, 'limit': MAX_ITEMS_PER_PAGE}
      }).then(({result} = {result: []}) => setProductIds(result))
    }
    setIsSearch(false)
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const search = searchRef.current
    if (!search) return

    const value = e.target.value
    search.setAttribute('type', value === 'price' ? 'number' : 'search')
    value === 'price'
      ? search.setAttribute('min', '0')
      : search.removeAttribute('min')

    search.value = ''
  }

  return (
    <div className="container">
      {!!filters.length && <>
        <form onSubmit={e => e.preventDefault()} className="search">
          <select ref={filterRef} onChange={e => handleSelectChange(e)}>
            {filters.map((option: string) => {
              return <option key={option}>{option}</option>
            })}
          </select>
          <input ref={searchRef} type="search" />
          <button onClick={() => setIsSearch(true)} type="submit">Поиск</button>
        </form>
      </>}
      <h1>{searchRef.current?.value ? 'Результаты поиска' : 'Все товары'}</h1>
      <div className="pagination">
        <button onClick={() => setCurrentPage(page => page - 1)} disabled={isLoading || currentPage <= 0}>Назад</button>
        <button onClick={() => setCurrentPage(page => page + 1)} disabled={isLoading || isLastPage}>Вперёд</button>
      </div>
      {isLoading
        ? <p>Загрузка...</p>
        : !products.length
          ? <p>Товаров не найдено</p>
          : <>
            <table>
              <thead>
              <tr>
                <th>Наименование</th>
                <th>Цена</th>
                <th>Бренд</th>
                <th>ID</th>
              </tr>
              </thead>
              <tbody>
              {products.map(product => {
                return <tr key={product.id}>
                  <td>{product.product}</td>
                  <td>{rubFormatter.format(product.price)}</td>
                  <td>{product.brand}</td>
                  <td>{product.id}</td>
                </tr>
              })}
              </tbody>
            </table>
          </>
      }
    </div>
  )
}

export default App
