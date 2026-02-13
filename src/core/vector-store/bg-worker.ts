// Qdrant client & embedding logic

import { Worker } from "bullmq";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai'

import { QdrantVectorStore } from "@langchain/qdrant"
import fs  from 'fs'

import "dotenv/config"





const worker = new Worker("upload_traces",async (job)=>{
    if (job.name=== "uplaod_traces_job"){
        console.log("Enterd in worker")

        try{
            const TraceData = JSON.parse(fs.readFileSync(job.data.tracePath, 'utf-8'));
            const TraceDataStr = JSON.stringify(TraceData) 
            // init
            const textSplitters = new RecursiveCharacterTextSplitter({
                chunkSize:300,
                chunkOverlap:40
            })

            const chunks = await textSplitters.splitText(TraceDataStr)
            console.log(chunks)

            const documents = chunks.map((chunk)=>({
                pageContent:chunk,
                metadata:{
                    traceId:job.data.traceId,
                    agentId:job.data.agentId,
                    timestamp: new Date().toString() 
                }
            }))


            // init for embeddings
            const embedding = new GoogleGenerativeAIEmbeddings({
                model:"text-embedding-004",
                apiKey:process.env.GOOGLE_API_KEY
            })

            const vectorStore = await QdrantVectorStore.fromExistingCollection(embedding,{
                url:"http://localhost:6333",
                collectionName:"agent-trace"
            })

            await vectorStore.addDocuments(documents);









        }catch(error){
            console.log("Trace embedding failed bg worker")
        }



    }
})




















