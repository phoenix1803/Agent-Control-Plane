// Qdrant client & embedding logic

import { childSend, Worker } from "bullmq";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { QdrantVectorStore } from "@langchain/qdrant"
import fs  from 'fs'
import path from "path";
import 'dotenv/config'

import "dotenv/config"
import { Document } from "@langchain/core/documents";




process.env.HF_HOME = path.join(process.cwd(), '.hf_cache');
const worker = new Worker("upload_traces",async (job)=>{
    if (job.name === "uplaod_traces_job"){
        console.log("Enterd in worker")

        try{
            const TraceData = JSON.parse(fs.readFileSync(job.data.tracePath, 'utf-8'));
            const TraceDataStr = JSON.stringify(TraceData) 
            // init
            const textSplitters = new RecursiveCharacterTextSplitter({
                chunkSize:500,
                chunkOverlap:40
            })

            const chunks = await textSplitters.splitText(TraceDataStr)
            console.log(chunks)
            
            // init for embeddings
            const embedding = new HuggingFaceTransformersEmbeddings({
                model: "Xenova/all-MiniLM-L6-v2", // 384 dimensions, fast & accurate
                // Alternative models:
                // "Xenova/all-mpnet-base-v2" - 768 dimensions, more accurate but slower
                // "Xenova/paraphrase-MiniLM-L3-v2" - 384 dimensions, fastest
            });

            const vectorStore = await QdrantVectorStore.fromExistingCollection(embedding,{
                url:"http://localhost:6333",
                collectionName:"agent-trace"
            })

            const BATCH_SIZE = 50;
            for(let i=0;i<chunks.length;i+=BATCH_SIZE){
                const batch = chunks.slice(i, i+BATCH_SIZE)
                const documents=[]

                for (const chunk of batch){
                    documents.push({

                        pageContent:chunk,
                        metadata: {
                            traceId: job.data.traceId,
                            agentId: job.data.agentId,
                            timestamp: new Date().toISOString()
                        }
                        

                    })
                }
                await vectorStore.addDocuments(documents)


            }

            console.log("\n Success!");
            return { success: true, chunks: chunks.length };








        }catch(error){
            console.log("Trace embedding failed bg worker", error)
        }



    }
},  {
    concurrency: 1,
    connection: {
      host: "localhost",
      port: 6379,
      password: process.env.REDIS_PASSWORD,
    },
  })




















