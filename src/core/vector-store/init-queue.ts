import { Queue } from "bullmq";
import 'dotenv/config'

export class Init_Queue {

    public traceId :string;
    public agentId:string;
    public tracePath:string;

    public constructor({traceId,agentId,tracePath}:{traceId:string,agentId:string,tracePath:string}) {
        this.traceId = traceId
        this.agentId = agentId
        this.tracePath = tracePath
        
    }

    async initQueue(){
        const queue = new Queue("upload_traces",{
            connection: {
                host: "localhost",
                port: 6379,
                password: process.env.REDIS_PASSWORD,
            }
        });
        

        await queue.add("uplaod_traces_job", { 
            traceId:this.traceId,
            agentId:this.agentId,
            tracePath:this.tracePath
        })


    }

}