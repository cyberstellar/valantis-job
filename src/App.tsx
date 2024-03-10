import React, {useEffect, useRef, useState} from 'react'
import md5 from 'crypto-js/md5'

import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'

import {Button, ButtonGroup, Divider, Input, LinearProgress, Option, Select, Stack, Table, Typography} from "@mui/joy"

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
  const filterRef = useRef('product')

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
    const searchValue = searchRef.current?.getElementsByTagName("input")[1].value
    if (searchValue) {
      if (isSearch) {
        const filter = filterRef.current
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

  function handleSelectChange(e: React.SyntheticEvent | null, filterValue: string | null) {
    const search = searchRef.current?.getElementsByTagName("input")[1]
    if (!search) return

    search.setAttribute('type', filterValue === 'price' ? 'number' : 'search')
    filterValue === 'price'
      ? search.setAttribute('min', '0')
      : search.removeAttribute('min')

    search.value = ''
    filterRef.current = filterValue || ''
  }

  return (
    <Stack spacing={2} maxWidth={1024} mx="auto" my={2}>
      {!!filters.length && <>
        <form onSubmit={e => e.preventDefault()}>
          <Input
            ref={searchRef}
            placeholder="Поиск"
            startDecorator={
              <>
                <Select
                  variant="plain"
                  defaultValue={'product'}
                  onChange={handleSelectChange}
                  slotProps={{
                    listbox: {
                      variant: 'outlined',
                    },
                  }}
                  sx={{ml: -1.5, '&:hover': {bgcolor: 'transparent'}}}
                >
                  {filters.map((option: string) => {
                    return <Option key={option} value={option}>{option}</Option>
                  })}
                </Select>
                <Divider orientation="vertical"></Divider>
              </>
            }
            endDecorator={
              <Button
                onClick={() => setIsSearch(true)}
                type="submit"
                sx={{borderTopLeftRadius: 0, borderBottomLeftRadius: 0}}
              >Поиск</Button>
            }
            sx={{'--Input-decoratorChildHeight': '40px'}}
          ></Input>
        </form>
      </>}

      <Typography
        level="h1">{searchRef.current?.getElementsByTagName("input")[1].value ? 'Результаты поиска' : 'Все товары'}</Typography>

      <ButtonGroup aria-label="outlined primary button group">
        <Button
          onClick={() => setCurrentPage(page => page - 1)}
          disabled={isLoading || currentPage <= 0}
          startDecorator={<KeyboardArrowLeft />}
        >
          Назад
        </Button>
        <Button
          onClick={() => setCurrentPage(page => page + 1)}
          disabled={isLoading || isLastPage}
          endDecorator={<KeyboardArrowRight />}
        >
          Вперёд
        </Button>
      </ButtonGroup>

      {
        isLoading
          ? <LinearProgress />
          : !products.length
            ? <Typography>Товаров не найдено</Typography>
            : <>
              <Table stripe="even" stickyHeader>
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
              </Table>
            </>
      }
    </Stack>
  )
}

export default App
