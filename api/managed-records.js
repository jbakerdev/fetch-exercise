import fetch from "../util/fetch-fill";
import URI from "urijs";

// /records endpoint
window.path = "http://localhost:3000/records";

// Your retrieve function plus any additional functions go here ...
const PAGE_SIZE = 10
const COLORS = { 
    red: { isPrimary: true }, 
    brown: { isPrimary: false }, 
    blue: { isPrimary: true }, 
    yellow: { isPrimary: true }, 
    green: { isPrimary: false } 
}
const DISPOSITION = { 
    open:'open', 
    closed:'closed' 
}

/**
 * Query string params to use when querying the records endpoint
 * 
 * recordsApiOptions
 * @param {number} limit, page size
 * @param {number} offset, starting record index
 * @param {string} color[] COLOR name to return, may be repeated
 * 
 */
const RecordsApiOptions = { limit:'limit', offset:'offset', color:'color[]'}

/**
 * Options to use when calling the retrieve api method
 * 
 * retrieveOptions
 * @param {number} page, which page of size PAGE_SIZE to return
 * @param {Array<string>} colors, array of COLOR names to include ('red','blue','green')
 * 
 */
const RetrieveOptions = { colors:'colors', page:'page' }

/**
 * Record returned by the /records endpoint
 * 
 * @param {number} id, the unique id of the record
 * @param {string} color, the name of the COLOR of the record
 * @param {string} disposition, the DISPOSITION of the record is one of "open" or "closed"
 * 
 */
const Record = { id:'id', color:'color', disposition:'disposition' }

/**
 * Response object returned by the retrieve method
 * 
 * @param {Array<string>} ids, the unique ids of the records
 * @param {Array<Record>} open, the records with 'open' DISPOSITION
 * @param {number} closedPrimaryCount, the count of records with 'closed' DISPOSITION that have the color 'red', 'green', or 'blue'
 * @param {number} previousPage, the page number for the previous page of results, or null if this is the first page
 * @param {number} nextPage, the page number for the next page of results, or null if this is the final page
 * 
 */
const RetrieveResponse = { ids:'ids', open:'open', closedPrimaryCount:'closedPrimaryCount', previousPage:'previousPage', nextPage:'nextPage' }

/**
 * Builds a uri from a retrieveOptions object
 * 
 * @param {RetrieveOptions} retrieveOptions,
 * 
 * @returns {string} The URI 
 */

const buildUriFromOptions = (retrieveOptions) => {
    let baseUri = new URI(window.path).addQuery(RecordsApiOptions.limit, PAGE_SIZE)
    
    if(retrieveOptions){
        baseUri.addQuery(RecordsApiOptions.offset, retrieveOptions[RetrieveOptions.page] ? (retrieveOptions[RetrieveOptions.page]-1)*PAGE_SIZE : 0)
        if(retrieveOptions[RetrieveOptions.colors] && retrieveOptions[RetrieveOptions.colors].forEach)
            retrieveOptions[RetrieveOptions.colors].forEach(colorName=>{
                 baseUri.addQuery(RecordsApiOptions.color,colorName)
                 if(!COLORS[colorName]) console.warn('buildUriFromOptions: invalid color param: '+colorName)
            })
        else Object.keys(COLORS).forEach(colorName=>baseUri.addQuery(RecordsApiOptions.color,colorName))
    }                                  

    return baseUri
}
                               
/**
 * Makes a request to the /records endpoint based on the given retrieveOptions
 * 
 * @param {retrieveOptions} retrieveOptions
 * 
 * @returns {string} The records in JSON format, or null if there was an error
 */
const retrieve = (retrieveOptions) => {
    return new Promise((resolve,reject)=>{
        fetch(buildUriFromOptions(retrieveOptions))
        .then(response => checkResponseStatus(response))
        .then((responseJson)=>{
            let response = generateRetrieveResponse(responseJson, retrieveOptions)
            //Check if there is another page of records... 
            let currentPage=1
            if(retrieveOptions && retrieveOptions[RetrieveOptions.page]) currentPage = retrieveOptions[RetrieveOptions.page]
            
            fetch(buildUriFromOptions({...retrieveOptions, [RetrieveOptions.page]: currentPage+1}))
            .then(nextPageRes=> checkResponseStatus(nextPageRes))
            .then(nextPageJson=>{
                if(nextPageJson.length === 0) response[RetrieveResponse.nextPage] = null
                resolve(response)
            })
            .catch(e=>{
                response[RetrieveResponse.nextPage] = null
                resolve(response)
            })
        })
        .catch(e=>{
            console.log('error when accessing /records endpoint: '+e)
            resolve()
        })
    })
    
}

/**
 * Checks if there was an http error and throws if there was, otherwise returns a promise that decodes the response json
 * 
 * @param {Response} response
 * 
 * @returns {Promise} to decode the records in JSON format, or null if there was an error
 */
const checkResponseStatus = (response) => {
    if(response.status < 400){
        return response.json()
    }
    else throw new Error('http error from /records endpoint: '+response.status)
}

/**
 * Transforms the response json from the records endpoint into a RetrieveResponse object
 * 
 * @param {Array<Record>} responseJson
 * @param {RetrieveOptions} retrieveOptions
 * 
 * @returns {RetrieveResponse} object with the transformed data
 */
const generateRetrieveResponse = (responseJson, retrieveOptions) => {
    let retrieveResponse = {
        [RetrieveResponse.ids]: [],
        [RetrieveResponse.open]: [],
        [RetrieveResponse.closedPrimaryCount]: 0,
        [RetrieveResponse.nextPage]: 0,
        [RetrieveResponse.previousPage]: 0,
    }
    if(retrieveOptions){
        if(retrieveOptions[RetrieveOptions.colors]){
            let filterColors = retrieveOptions[RetrieveOptions.colors]
            responseJson = responseJson.filter(record=>
                filterColors.findIndex(colorName=>colorName === record[Record.color]) !== -1
            )
        }
        if(retrieveOptions[RetrieveOptions.page]){
            retrieveResponse[RetrieveResponse.previousPage] = retrieveOptions[RetrieveOptions.page]-1 >= 1 ? retrieveOptions[RetrieveOptions.page]-1 : null
            //We will validate this momentarily...
            retrieveResponse[RetrieveResponse.nextPage] = retrieveOptions[RetrieveOptions.page]+1
        }
        else {
            retrieveResponse[RetrieveResponse.previousPage] = null
            retrieveResponse[RetrieveResponse.nextPage] = 2
        }
    }
    else {
        retrieveResponse[RetrieveResponse.previousPage] = null
        retrieveResponse[RetrieveResponse.nextPage] = 2
    } 
    
    responseJson.forEach(record=>{
        retrieveResponse[RetrieveResponse.ids].push(record[Record.id])
        let color = COLORS[record[Record.color]]
        if(record[Record.disposition] === DISPOSITION.open) retrieveResponse[RetrieveResponse.open].push({...record, isPrimary: color && color.isPrimary})
        if(color && color.isPrimary && record[Record.disposition] === DISPOSITION.closed){
            retrieveResponse[RetrieveResponse.closedPrimaryCount]++
        }
    })

    return retrieveResponse
}

export default retrieve;
